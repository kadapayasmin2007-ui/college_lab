
const mysql = require("mysql2");

// MySQL Database Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "yasmin14",
    database: "college_lab_management"
});

// Connect to Database
db.connect((err) => {
    if (err) {
        console.error("MySQL Connection Failed!");
        console.error(err.message);
        return;
    }

    console.log("MySQL Database Connected Successfully!");
});

// Check Database Connection
db.on("error", (err) => {
    console.error("Database Error:", err.message);
});

module.exports = db;
