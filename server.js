
const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ================= HOME PAGE =================
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// ================= DASHBOARD =================
app.get("/api/dashboard", (req, res) => {

    const sql = `
        SELECT
        (SELECT COUNT(*) FROM equipment) AS totalEquipment,
        (SELECT COUNT(*) FROM students) AS totalStudents,
        (SELECT COUNT(*) FROM equipment_issue WHERE status='Issued') AS issuedEquipment
    `;

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(result[0]);
    });
});

// ================= GET EQUIPMENT =================
app.get("/api/equipment", (req, res) => {

    const sql = "SELECT * FROM equipment";

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(result);
    });
});

// ================= ADD EQUIPMENT =================
app.post("/api/equipment", (req, res) => {

    const { name, category, quantity, available_quantity } = req.body;

    const sql = `
        INSERT INTO equipment
        (name, category, quantity, available_quantity)
        VALUES (?, ?, ?, ?)
    `;

    db.query(
        sql,
        [name, category, quantity, available_quantity],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: "Equipment added successfully!",
                equipment_id: result.insertId
            });
        }
    );
});

// ================= UPDATE EQUIPMENT =================
app.put("/api/equipment/:id", (req, res) => {

    const { name, category, quantity, available_quantity } = req.body;
    const equipmentId = req.params.id;

    const sql = `
        UPDATE equipment
        SET name=?, category=?, quantity=?, available_quantity=?
        WHERE equipment_id=?
    `;

    db.query(
        sql,
        [name, category, quantity, available_quantity, equipmentId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({ message: "Equipment updated successfully!" });
        }
    );
});

// ================= DELETE EQUIPMENT =================
app.delete("/api/equipment/:id", (req, res) => {

    const equipmentId = req.params.id;

    db.query(
        "DELETE FROM equipment WHERE equipment_id=?",
        [equipmentId],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({ message: "Equipment deleted successfully!" });
        }
    );
});

// ================= GET STUDENTS =================
app.get("/api/students", (req, res) => {

    const sql = "SELECT * FROM students";

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(result);
    });
});

// ================= ADD STUDENT =================
app.post("/api/students", (req, res) => {

    const { student_name, department, phone } = req.body;

    const sql = `
        INSERT INTO students
        (student_name, department, phone)
        VALUES (?, ?, ?)
    `;

    db.query(
        sql,
        [student_name, department, phone],
        (err, result) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                message: "Student added successfully!",
                student_id: result.insertId
            });
        }
    );
});

// ================= GET ISSUE DETAILS =================
app.get("/api/issues", (req, res) => {

    const sql = `
        SELECT
            ei.issue_id,
            ei.equipment_id,
            ei.student_id,
            s.student_name,
            e.name AS equipment_name,
            ei.quantity,
            ei.issue_date,
            ei.return_date,
            ei.status
        FROM equipment_issue ei
        JOIN students s ON ei.student_id = s.student_id
        JOIN equipment e ON ei.equipment_id = e.equipment_id
        ORDER BY ei.issue_id DESC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json(result);
    });
});

// ================= ISSUE EQUIPMENT =================
app.post("/api/issues", (req, res) => {

    const {
        equipment_id,
        student_id,
        quantity,
        issue_date,
        return_date
    } = req.body;

    if (!equipment_id || !student_id || !quantity || !issue_date) {
        return res.status(400).json({
            message: "Please provide all required details."
        });
    }

    db.beginTransaction((err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const checkSql = `
            SELECT available_quantity
            FROM equipment
            WHERE equipment_id = ?
            FOR UPDATE
        `;

        db.query(checkSql, [equipment_id], (err, rows) => {
            if (err || rows.length === 0) {
                return db.rollback(() => {
                    res.status(400).json({
                        message: err ? err.message : "Equipment not found."
                    });
                });
            }

            if (rows[0].available_quantity < quantity) {
                return db.rollback(() => {
                    res.status(400).json({
                        message: "Not enough equipment available."
                    });
                });
            }

            const issueSql = `
                INSERT INTO equipment_issue
                (equipment_id, student_id, quantity, issue_date, return_date, status)
                VALUES (?, ?, ?, ?, ?, 'Issued')
            `;

            db.query(
                issueSql,
                [
                    equipment_id,
                    student_id,
                    quantity,
                    issue_date,
                    return_date || null
                ],
                (err, result) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: err.message });
                        });
                    }

                    db.query(
                        `UPDATE equipment
                         SET available_quantity = available_quantity - ?
                         WHERE equipment_id = ?`,
                        [quantity, equipment_id],
                        (err) => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ error: err.message });
                                });
                            }

                            db.commit((err) => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.status(500).json({ error: err.message });
                                    });
                                }

                                res.json({
                                    message: "Equipment issued successfully!",
                                    issue_id: result.insertId
                                });
                            });
                        }
                    );
                }
            );
        });
    });
});

// ================= RETURN EQUIPMENT =================
app.put("/api/issues/:id/return", (req, res) => {

    const issueId = req.params.id;

    db.beginTransaction((err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const findSql = `
            SELECT equipment_id, quantity, status
            FROM equipment_issue
            WHERE issue_id = ?
            FOR UPDATE
        `;

        db.query(findSql, [issueId], (err, rows) => {
            if (err || rows.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({
                        message: err ? err.message : "Issue record not found."
                    });
                });
            }

            const issue = rows[0];

            if (issue.status === "Returned") {
                return db.rollback(() => {
                    res.status(400).json({
                        message: "This equipment is already returned."
                    });
                });
            }

            db.query(
                `UPDATE equipment_issue
                 SET status='Returned'
                 WHERE issue_id=?`,
                [issueId],
                (err) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: err.message });
                        });
                    }

                    db.query(
                        `UPDATE equipment
                         SET available_quantity = available_quantity + ?
                         WHERE equipment_id = ?`,
                        [issue.quantity, issue.equipment_id],
                        (err) => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ error: err.message });
                                });
                            }

                            db.commit((err) => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.status(500).json({ error: err.message });
                                    });
                                }

                                res.json({
                                    message: "Equipment returned successfully!"
                                });
                            });
                        }
                    );
                }
            );
        });
    });
});

// ================= SERVER =================
const PORT = 3000;

app.listen(PORT, () => {
    console.log("--------------------------------------");
    console.log("COLLEGE LAB MANAGEMENT SYSTEM");
    console.log(`Server running at http://localhost:${PORT}`);
    console.log("--------------------------------------");
});
