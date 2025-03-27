// ethereum/index.js

console.log("Server up and running");

// Se usi Express, puoi fare ad esempio:
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => res.send('Hello World!'));
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));