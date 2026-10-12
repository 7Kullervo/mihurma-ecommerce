require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const pool = require("./db");

(async () => {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS db, VERSION() AS version"
    );
    console.log("Database connection successful!");
    console.log(rows[0]);
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
