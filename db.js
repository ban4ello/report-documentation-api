const Pool = require('pg').Pool;
const pool = new Pool({
	user: 'postgres',
	password: 'root',
	host: 'https://90.156.171.85',
	// host: 'localhost',
	port: 5432,
	database: 'postrges',
	// database: 'calculations-analysis',
	// database: 'node_postrges',
})

module.exports = pool