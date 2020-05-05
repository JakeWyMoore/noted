const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');

const { mongoose } = require('./db/mongoose');

// LOAD IN MONGOOSE MODELS
const { List, Task, User } = require('./db/models');
const jwt = require('jsonwebtoken');

// LOAD MIDDLEWARE
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extends:true}));
app.use(express.static(path.join(__dirname, '../frontend/dist/')));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token, X-Refresh-Token, _id");
    res.header("Access-Control-Expose-Headers", "x-access-token, x-refresh-token");

    next();
  });

// CHECK IF REQUEST HAS VALID JWT ACCESS TOKEN
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            res.status(401).send(err);
        } else {
            req.user_id = decoded._id;
            next();
        }
    });
}

// VERIFY REFRESH TOKEN MIDDLEWARE ( VERIFY SESSION )
let verifySession = (req, res, next) => {
    let refreshToken = req.header('x-refresh-token');
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
            return Promise.reject({
                'error': 'User not found. Make sure refresh token and user id are correct.'
            })
        }
        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid) {
            next();
        } else {
            return Promise.reject({
                'error': 'Refresh token has expired or session is invalid.'
            })
        }
    }).catch((e) => {
        res.status(401).send(e);
    });
}

// ROOT HANDELERS

// LIST ROUTES

// GET ALL LISTS
app.get('/lists', authenticate, (req, res) => {
    // return an array of all lists in a users database
    List.find({
        _userId: req.user_id
    }).then((lists) => {
        res.send(lists);
    }).catch((e) => {
        res.send(e);
    });
});

// app.get('/lists/:listId/tasks/:taskId', (req, res) => {
//     Task.findOne({
//         _id: req.params.taskId,
//         _listId: req.params.listId,
//     }).then((task) => {
//         res.send(task);
//     });
// });

// CREATE NEW LISTS
app.post('/lists', authenticate, (req, res) => {
    // create new list and return back to the user
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDoc) => {
        // return list document
        res.send(listDoc);
    });
});

// UPDATE A LIST
app.patch('/lists/:id', authenticate, (req, res) => {
    // update an existing list
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
        $set: req.body
    }).then(() => {
        res.send({ 'message': 'Update Success.' });
    });
});

// DELETE A LIST
app.delete('/lists/:id', authenticate, (req, res) => {
    // delete an existing list
    List.findOneAndRemove({
        _id: req.params.id,
        _userId: req.user_id,
    }).then((removedListDoc) => {
        res.send(removedListDoc);

        // delete all tasks in deleted list
        deleteTasksFromList(removedListDoc._id);
    });
});



// TASKS
// GET TASKS
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
    // return all tasks under specific list
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks)
    });
});

// CREATE TASK
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
    // create a new task in a list

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            return true;
        }

        return false;
    }).then((canCreateTask) => {
        if (canCreateTask) {
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            });
        } else {
            res.sendStatus(404);
        }
    })
});

// UPDATE TASKS
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    // update an existing task in a list

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id,
    }).then((list) => {
        if (list) {
            return true;
        }

        return false;
    }).then((canUpdateTasks) => {
        if (canUpdateTasks) {
            Task.findOneAndUpdate({
                _id: req.params.taskId,
                _listId: req.params.listId,
            }, {
                $set: req.body
            }).then(() => {
                res.send({message: 'Updated Successfully.'});
            });
        } else {
            res.sendStatus(404);
        }
    });
});

// DELETE A TAKS
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    // delete a specified task in a list

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id,
    }).then((list) => {
        if (list) {
            return true;
        }

        return false;
    }).then((canDeleteTasks) =>{

        if (canDeleteTasks) {
            Task.findOneAndRemove({
                _id: req.params.taskId,
                _listId: req.params.listId,
            }).then((removedTaskDoc) => {
                res.send(removedTaskDoc);
            });
        } else {
            res.sendStatus(404);
        }
    });
});


// USER ROUTES
// SIGN UP
app.post('/users', (req, res) => {
    // sign up a user
    let body = req.body;
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        return newUser.generateAccessAuthToken().then((accessToken) => {
            return { accessToken, refreshToken }
        })
    }).then((authTokens) => {
        res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(newUser);
    }).catch((e) => {
        res.status(400).send(e);
    });
});

// LOGIN
app.post('/users/login', (req, res) => {
    let email = req.body.email;
    let password = req.body.password;

    User.findByCredentials(email, password).then((user) => {
        return user.createSession().then((refreshToken) => {
            return user.generateAccessAuthToken().then((accessToken) => {
                return { accessToken, refreshToken };
            });
        }).then((authTokens) => {
            res
                .header('x-refresh-token', authTokens.refreshToken)
                .header('x-access-token', authTokens.accessToken)
                .send(user);
        });
    }).catch((e) => {
        res.status(400).send(e);
    });
});

// GENERATE AND RETURN ACCESS TOKEN
app.get('/users/me/access-token', verifySession, (req, res) => {
    // generate and return access token
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
});

// HELPER METHODS
let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log("Tasks from " + _listId + " were deleted.");
    });
}

app.all("*", (req,res,next) => {
    res.sendFile(path.resolve("../frontend/dist/index.html"))
});

app.listen(3000, () => {
    console.log('Server listening on port 3000')
});
