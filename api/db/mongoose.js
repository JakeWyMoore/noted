// handel connection logic to the MongoDB database

const mongoose = require('mongoose');

mongoose.Promise = global.Promise;
mongoose.connect('mongodb://localhost:27017/TaskManger', { useNewUrlParser: true, useUnifiedTopology: true }).then(() => {
    console.log('Connected to MongoDB Successfully')
}).catch((e) => {
    console.log('There was an error: ', e)
});

mongoose.set('useCreateIndex', true);
mongoose.set('useFindAndModify', true);

module.exports = {
    mongoose
};