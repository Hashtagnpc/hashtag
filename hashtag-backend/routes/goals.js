
const express = require("express");
const router = express.Router();
const { pool } = require("../config/database");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        g.id,
        g.name,
        g.target_usd_cents,
        COALESCE(SUM(c.amount_usd_cents), 0)::BIGINT AS raised_usd_cents
      FROM goals g
      LEFT JOIN contributions c ON c.goal_id = g.id
      WHERE g.is_active = TRUE
      GROUP BY g.id, g.name, g.target_usd_cents
      ORDER BY g.id
    `);

    const goals = result.rows.map((goal) => ({
      id: goal.id,
      name: goal.name,
      targetUsd: Number(goal.target_usd_cents) / 100,
      raisedUsd: Number(goal.raised_usd_cents) / 100,
    }));

    res.json({
      success: true,
      goals,
    });
  } catch (error) {
    console.error("Unable to retrieve goals:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to retrieve fundraising goals.",
    });
  }
});

module.exports = router;
