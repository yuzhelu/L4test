var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// user schema
var MovieSchema = new Schema(
    {
        title: {type: String, required: true},
        year: {type: Number, required: true},
        genre: {type: String, enum: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
                'Mystery', 'Thriller', 'Western'], required: true},
        actors: {type: Array},
        imageUrl: {type: String},
        avgRating: {type: Number}
    }
);

MovieSchema.pre('save',function (next) {
    if(this.actors.length < 3){
        return next(new Error('Insert at least 3 actors.'));
    }
    next()
});

// return the model
module.exports = mongoose.model('Movie', MovieSchema);