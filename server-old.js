const fs = require('fs');
const http = require('http');
const https = require('https');
const privateKey  = fs.readFileSync('./host.key', 'utf8');
const certificate = fs.readFileSync('./host.cert', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const express = require('express')
const cors = require('cors');
const HTTP_PORT = process.env.HTTP_PORT || 8001
const HTTPS_PORT = process.env.HTTPS_PORT || 8000
const app = express()
const calculationRouter = require('./routes/calculation.routes.js')
const parentCalculationRouter = require('./routes/parent-calculation.routes.js')
const workersRouter = require('./routes/workers.routes.js')

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
app.use('/api', workersRouter)

app.get("/", function(request, response){
     
    // отправляем ответ
    response.send("<h2>Привет Express!</h2>");
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);
// app.listen(PORT, () => console.log('Server started on port ' + PORT))
httpServer.listen(HTTP_PORT, () => console.log('http server started on port ' + HTTP_PORT));
httpsServer.listen(HTTPS_PORT, () => console.log('https Server started on port ' + HTTPS_PORT));
httpsServer.requestTimeout = 10000;

// app.requestTimeout = 10000;