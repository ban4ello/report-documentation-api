const express = require('express')
const cors = require('cors');
const PORT = process.env.PORT || 8000
const app = express()
const userRouter = require('./routes/user.routes.js')
const calculationRouter = require('./routes/calculation.routes.js')
// app.use(cors({origin: ['http://localhost:5173', 'http://127.0.0.1:5173']}));
app.use(cors())


app.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    // res.setHeader('Access-Control-Allow-Origin', 'localhost:5173');

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    res.setHeader('Access-Control-Allow-Credentials', true);

    // Pass to next layer of middleware
    next();
});
app.use(express.json())
app.use('/api', userRouter)
app.use('/api', calculationRouter)

app.listen(PORT, () => console.log('Server started on port ' + PORT))