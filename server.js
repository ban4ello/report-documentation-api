const express = require('express')
const cors = require('cors');
const PORT = process.env.PORT || 8000
const app = express()
const calculationRouter = require('./routes/calculation.routes.js')
const parentCalculationRouter = require('./routes/parent-calculation.routes.js')
// app.use(cors({origin: ['http://localhost:5173', 'http://127.0.0.1:5173']}));
app.use(cors())


app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', true);

    next();
});
app.use(express.json())
app.use('/api', calculationRouter)
app.use('/api', parentCalculationRouter)

app.listen(PORT, () => console.log('Server started on port ' + PORT))