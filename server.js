var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var passport = require('passport');
var authJwtController = require('./auth_jwt');
var User = require('./user');
var jwt = require('jsonwebtoken');
var Movie = require('./movie');
var dotenv = require('dotenv').config();
var mongoose = require('mongoose');
var decode = require('jwt-decode');
var Review = require('./review');

mongoose.connect(process.env.mongoDB, (err, database) => {
    if(err) throw err;
console.log('Connected to database.');
db = database;
console.log('Database connected on ' + process.env.mongoDB);
});

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());
app.use(cors());

var router = express.Router();
var signinUser = "";

router.route('/movies/:title')
    .get(authJwtController.isAuthenticated, function (req, res) {
        var title = req.params.title;
        var viewReview = req.query.reviews;
        if (viewReview !== "true"){
            Movie.findOne({title: title}, function(err, movies) {
                if (err) res.send(err);

                res.json(movies);
            });
        }
        else{
            Movie.aggregate([{
                $match: {
                    title: title
                }}, {
                $lookup:{
                    from: "reviews",
                    localField: "title",
                    foreignField: "movie",
                    as: "movie_reviews"
                }
            }]).exec((err, movies)=>{
                if (err) res.send(err);
            res.json(movies);
        });
        }
    });

router.route('/movies/all')
    .get(authJwtController.isAuthenticated, function (req, res) {
        var viewReview = req.query.reviews;
        if (viewReview !== "true"){
            Movie.find(function (err, movies) {
                if (err) res.send(err);
                res.json(movies);
            });
        }
        else{
            Movie.aggregate([{
                $lookup:{
                    from: "reviews",
                    localField: "title",
                    foreignField: "movie",
                    as: "movie_reviews"
                }
            }, {$sort: {avgRating: -1}}]).exec((err, movie)=>{
                if (err) res.send(err);
            res.json(movie);
        });
        }
    });

router.route('/movies/insert')
    .post(authJwtController.isAuthenticated, function (req, res) {
        Movie.findOne({title: req.body.title}).exec(function(err, movie){
            if (movie === null){
                var newMovie = new Movie(req, res);
                newMovie.title = req.body.title;
                newMovie.yearRelease = req.body.yearRelease;
                newMovie.genre = req.body.genre;
                newMovie.actors = req.body.actors;
                newMovie.save(function(err) {
                    if (err) {
                        // duplicate entry
                        if (err.code == 11000)
                            return res.json({ success: false, msg: 'Movie already in database.'});
                        else
                            return res.send(err);
                    }

                    res.json({ msg: 'Movie insert success.' });
                });
            }
            else{
                res.json({ msg: 'Movie already in database.'});
            }
        });
    });

router.route('/movies/update/:title')
    .put(authJwtController.isAuthenticated, function (req, res) {
        Movie.findOne({title: req.params.title}).exec(function(err, movie) {
            if (movie !== null) {
                movie.title = req.body.title;
                movie.yearRelease = req.body.yearRelease;
                movie.genre = req.body.genre;
                movie.actors = req.body.actors;
                movie.save(function(err) {
                    if (err) {
                        // duplicate entry
                        if (err.code == 11000)
                            return res.json({ success: false, msg: 'Movie already exists in database.'});
                        else
                            return res.send(err);
                    }
                    res.json({ msg: 'Movie update success.' });
                });
            }
            else
            {
                res.json({ msg: 'Movie update failed. Movie does not exist in database.' });
            }
        });
    });

router.route('/movies/delete/:title')
    .delete(authJwtController.isAuthenticated, function(req, res){
        Movie.remove({title: req.params.title}, function(err, movie){
            if (err) return res.send(err);
            Review.remove({movie: req.params.title}, function(err, review){
                if(err) return (res.send(err));
            });
            res.json({msg: 'Movie delete successful.'});
        });
    });

router.route('/reviews/all')
    .get(authJwtController.isAuthenticated, function (req, res) {
        Review.find(function (err, review) {
            if (err) return res.send(err);
            res.json(review);
        });
    });

router.route('/reviews/viewuser')
    .get(authJwtController.isAuthenticated, function (req, res) {
        Review.find({username: signinUser}, function (err, review) {
            if (err) res.send(err);
            if (review === null){
                res.json({msg: "User has not posted any reviews."});
            }
            else {
                res.json(review);
            }
        });
    });

router.route('/reviews/insert/:title')
    .post(authJwtController.isAuthenticated, function (req, res) {
        var token = req.headers['authorization'];
        var tokenDecode = decode(token);
        var username = tokenDecode['username'];
        Movie.findOne({title: req.params.title}).exec(function(err, movie){
            if (movie !== null){
                var newReview = new Review(req, res);
                newReview.username = username;
                newReview.review = req.body.review;
                newReview.rating = req.body.rating;
                newReview.movie = req.params.title;
                newReview.save(function(err) {
                    if (err) {
                        // duplicate entry
                        if (err.code == 11000)
                            return res.json({ success: false, msg: 'Review already in database.'});
                        else
                            return res.send(err);
                    }
                    else{
                        Review.find({movie: req.params.title}).count(function(err, numReview){
                            if (err) return res.send(err);
                            else{
                                Movie.distinct("avgRating", {title: req.params.title}).exec(function(err, rating){
                                    if (err) return res.send(err);
                                    else{
                                        var newRating = ((rating[0] * (numReview - 1)) + req.body.rating) / (numReview);
                                        Movie.update({ title: req.params.title }, { $set: { avgRating: newRating } }).exec(function(err){
                                            if (err) return res.send(err);
                                        });
                                    }
                                });
                            }
                        });
                    }

                    res.json({ msg: 'Review insert success.' });
                });
            }
            else{
                res.json({ msg: 'Movie not found in database. Cannot insert review.'});
            }
        });
    });

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.name || !req.body.password) {
        res.json({success: false, msg: 'Please pass username, name, and password.'});
    }
    else {
        var user = new User();
        user.username = req.body.username;
        user.name = req.body.name;
        user.password = req.body.password;

        user.save(function(err) {
            if (err) {
                // duplicate entry
                if (err.code == 11000)
                    return res.json({ success: false, msg: 'User already exists. '});
                else
                    return res.send(err);
            }
            res.json({ msg: 'signed up.' });
        });
    }
});

router.post('/signin', function(req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.name = req.body.name;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('username name password').exec(function(err, user) {
        if (err) res.send(err);

        user.comparePassword(userNew.password, function(isMatch){
            if (isMatch) {
                var userToken = {id: user._id, username: user.username};
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed. Wrong password.'});
            }
        });


    });
});

app.use('/', router);
app.listen(process.env.PORT || 5000);
console.log("Listening on port " + (process.env.PORT || 5000));
