
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { getUsdGhsRate } = require("../services/exchangeRate");

const { pool } = require("../config/database");

const PAYSTACK_URL =
    process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

const MIN_AMOUNT_USD_CENTS = 100;
const MAX_AMOUNT_USD_CENTS = 10000000;

const EXPECTED_GOALS = ["ps5", "gta6", "monitor"];

/**
 * Split an integer amount proportionally.
 * Uses the largest-remainder method so every cent/pesewa is allocated.
 */
function allocateCents(totalCents, goals) {
    if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
        throw new Error("Invalid amount for allocation.");
    }

    const totalWeight = goals.reduce(
        (sum, goal) => sum + Number(goal.target_usd_cents),
        0
    );

    if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
        throw new Error("Invalid fundraising goal weights.");
    }

    const allocations = goals.map((goal) => {
        const weight = Number(goal.target_usd_cents);
        const numerator = totalCents * weight;

        return {
            goalId: goal.id,
            amount: Math.floor(numerator / totalWeight),
            remainder: numerator % totalWeight
        };
    });

    let remaining = totalCents - allocations.reduce(
        (sum, item) => sum + item.amount,
        0
    );

    const ranked = [...allocations].sort(
        (a, b) =>
            b.remainder - a.remainder ||
            EXPECTED_GOALS.indexOf(a.goalId) -
                EXPECTED_GOALS.indexOf(b.goalId)
    );

    for (let i = 0; i < remaining; i++) {
        ranked[i].amount += 1;
    }

    return allocations.map(({ goalId, amount }) => ({
        goalId,
        amount
    }));
}

/**
 * Allocate a payment to one goal or all active goals.
 */
function buildAllocations(goalId, amountUsdCents, amountGhsPesewas, goals) {
    if (goalId !== "all") {
        const goal = goals.find((item) => item.id === goalId);

        if (!goal) {
            throw new Error("Selected fundraising goal is unavailable.");
        }

        return [{
            goalId: goal.id,
            amountUsdCents,
            amountGhsPesewas
        }];
    }

    const usdParts = allocateCents(amountUsdCents, goals);
    const ghsParts = allocateCents(amountGhsPesewas, goals);

    return usdParts.map((part) => {
        const ghsPart = ghsParts.find(
            (item) => item.goalId === part.goalId
        );

        return {
            goalId: part.goalId,
            amountUsdCents: part.amount,
            amountGhsPesewas: ghsPart.amount
        };
    });
}

/**
 * Fetch active goals and validate the configured fundraising targets.
 */
async function getActiveGoals() {
    const result = await pool.query(
        `SELECT id, name, target_usd_cents
         FROM goals
         WHERE is_active = TRUE
         ORDER BY
            CASE id
                WHEN 'ps5' THEN 1
                WHEN 'gta6' THEN 2
                WHEN 'monitor' THEN 3
                ELSE 4
            END`
    );

    return result.rows.filter(
        (goal) =>
            EXPECTED_GOALS.includes(goal.id) &&
            Number.isSafeInteger(Number(goal.target_usd_cents)) &&
            Number(goal.target_usd_cents) > 0
    ).map((goal) => ({
        ...goal,
        target_usd_cents: Number(goal.target_usd_cents)
    }));
}

/**
 * Initialize a Paystack card transaction.
 */
router.post("/initialize", async (req, res) => {
    const {
        goalId,
        email,
        amountUsdCents
    } = req.body || {};

    if (
        typeof goalId !== "string" ||
        !["all", ...EXPECTED_GOALS].includes(goalId)
    ) {
        return res.status(400).json({
            success: false,
            message: "Please select a valid fundraising goal."
        });
    }

    const suppliedEmail =
        typeof email === "string" ? email.trim().toLowerCase() : "";

    if (
        email !== undefined &&
        email !== null &&
        email !== "" &&
        (
            typeof email !== "string" ||
            suppliedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suppliedEmail)
        )
    ) {
        return res.status(400).json({
            success: false,
            message: "Please enter a valid email address."
        });
    }

    if (
        !Number.isSafeInteger(amountUsdCents) ||
        amountUsdCents < MIN_AMOUNT_USD_CENTS ||
        amountUsdCents > MAX_AMOUNT_USD_CENTS
    ) {
        return res.status(400).json({
            success: false,
            message: "Contribution must be between $1 and $100,000."
        });
    }

let rate;

try {
    const exchangeRate = await getUsdGhsRate();
    rate = exchangeRate.rate;
} catch (error) {
    console.error("Exchange rate unavailable:", error.message);

    return res.status(503).json({
        success: false,
        message: "Payments are temporarily unavailable. Please try again later."
    });
}

    if (!Number.isFinite(rate) || rate <= 0) {
        return res.status(500).json({
            success: false,
            message: "Payment exchange rate is not configured."
        });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
            success: false,
            message: "Payment service is not configured."
        });
    }

    if (!Number.isFinite(rate * amountUsdCents)) {
        return res.status(400).json({
            success: false,
            message: "Invalid converted payment amount."
        });
    }

    const amountGhsPesewas = Math.round(amountUsdCents * rate);

    if (
        !Number.isSafeInteger(amountGhsPesewas) ||
        amountGhsPesewas < 10
    ) {
        return res.status(400).json({
            success: false,
            message: "The converted contribution is below the payment minimum."
        });
    }

    const customerEmail = suppliedEmail ||
        `anonymous-${crypto.randomUUID()}@example.com`;

    const reference = `hashtag-${crypto.randomUUID()}`;

    let paymentId;

    try {
        const goals = await getActiveGoals();

        if (goalId === "all" && goals.length !== 3) {
            return res.status(503).json({
                success: false,
                message: "All fundraising goals must be active before using this option."
            });
        }

        const selectedGoal = goalId === "all"
            ? null
            : goals.find((goal) => goal.id === goalId);

        if (goalId !== "all" && !selectedGoal) {
            return res.status(404).json({
                success: false,
                message: "Fundraising goal not found."
            });
        }

        const paymentResult = await pool.query(
            `INSERT INTO payments (
                reference,
                goal_id,
                customer_email,
                amount_ghs_pesewas,
                amount_usd_cents,
                exchange_rate,
                currency,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'GHS', 'pending')
            RETURNING id`,
            [
                reference,
                selectedGoal ? selectedGoal.id : null,
                customerEmail,
                amountGhsPesewas,
                amountUsdCents,
                rate
            ]
        );

        paymentId = paymentResult.rows[0].id;

        const paystackResponse = await fetch(
            `${PAYSTACK_URL}/transaction/initialize`,
            {
                method: "POST",
                headers: {
                    Authorization:
                        `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: customerEmail,
                    amount: amountGhsPesewas,
                    currency: "GHS",
                    channels: ["card"],
                    reference,
                    ...(process.env.PAYSTACK_CALLBACK_URL
                        ? {
                            callback_url:
                                process.env.PAYSTACK_CALLBACK_URL
                        }
                        : {}),
                    metadata: {
                        goal_id: goalId,
                        goal_name: selectedGoal
                            ? selectedGoal.name
                            : "All Goals",
                        amount_usd_cents: amountUsdCents,
                        anonymous: !suppliedEmail
                    }
                }),
                signal: AbortSignal.timeout(15000)
            }
        );

        const paystackData = await paystackResponse.json();

        if (
            !paystackResponse.ok ||
            !paystackData.status ||
            !paystackData.data?.access_code
        ) {
            throw new Error(
                paystackData.message ||
                "Paystack initialization failed."
            );
        }

        return res.status(201).json({
            success: true,
            message: "Payment initialized successfully.",
            payment: {
                reference,
                accessCode: paystackData.data.access_code,
                amountUsd: amountUsdCents / 100,
                currency: "GHS",
                goalId
            }
        });
    } catch (error) {
        console.error(
            "Payment initialization error:",
            error.message
        );

        if (paymentId) {
            try {
                await pool.query(
                    `UPDATE payments
                     SET status = 'failed', updated_at = NOW()
                     WHERE id = $1 AND status = 'pending'`,
                    [paymentId]
                );
            } catch (databaseError) {
                console.error(
                    "Could not update failed payment:",
                    databaseError.message
                );
            }
        }

        return res.status(502).json({
            success: false,
            message: "Unable to initialize payment. Please try again."
        });
    }
});

/**
 * Return an internal USD-to-GHS quote.
 * The frontend does not need to display this conversion.
 */
router.get("/quote", async (req, res) => {
    const amountUsdCents = Number(req.query.amountUsdCents);
let rate;

try {
    const exchangeRate = await getUsdGhsRate();
    rate = exchangeRate.rate;
} catch (error) {
    return res.status(503).json({
        success: false,
        message: "Exchange rate currently unavailable."
    });
}


    if (
        !Number.isSafeInteger(amountUsdCents) ||
        amountUsdCents < MIN_AMOUNT_USD_CENTS ||
        amountUsdCents > MAX_AMOUNT_USD_CENTS
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid contribution amount."
        });
    }

    if (!Number.isFinite(rate) || rate <= 0) {
        return res.status(503).json({
            success: false,
            message: "Exchange rate unavailable."
        });
    }

    const amountGhsPesewas = Math.round(amountUsdCents * rate);

    if (!Number.isSafeInteger(amountGhsPesewas)) {
        return res.status(400).json({
            success: false,
            message: "Invalid converted amount."
        });
    }

    return res.json({
        success: true,
        amountUsdCents,
        amountGhsPesewas,
        currency: "GHS",
        rateType: "automatic_daily_rate"
    });
});

/**
 * Verify a transaction directly with Paystack.
 * Contributions are recorded only after successful verification.
 */
router.get("/verify/:reference", async (req, res) => {
    const reference = req.params.reference;

    if (
        typeof reference !== "string" ||
        !/^hashtag-[a-f0-9-]{36}$/i.test(reference)
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid payment reference."
        });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
            success: false,
            message: "Payment service is not configured."
        });
    }

    let client;

    try {
        const localResult = await pool.query(
            `SELECT
                id,
                reference,
                goal_id,
                customer_email,
                amount_ghs_pesewas,
                amount_usd_cents,
                currency,
                status
             FROM payments
             WHERE reference = $1`,
            [reference]
        );

        if (localResult.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Payment reference not found."
            });
        }

        const localPayment = localResult.rows[0];

        if (localPayment.status === "success") {
            return res.json({
                success: true,
                message: "Payment was already verified.",
                status: "success"
            });
        }

        if (localPayment.status !== "pending") {
            return res.status(409).json({
                success: false,
                message: "This payment is not awaiting verification.",
                status: localPayment.status
            });
        }

        const response = await fetch(
            `${PAYSTACK_URL}/transaction/verify/${encodeURIComponent(reference)}`,
            {
                method: "GET",
                headers: {
                    Authorization:
                        `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                },
                signal: AbortSignal.timeout(15000)
            }
        );

        const verification = await response.json();

        if (
            !response.ok ||
            !verification.status ||
            !verification.data
        ) {
            return res.status(502).json({
                success: false,
                message: "Unable to verify payment with Paystack."
            });
        }

        const transaction = verification.data;

        if (transaction.status !== "success") {
            return res.status(202).json({
                success: false,
                message: "Payment has not been confirmed as successful.",
                status: transaction.status
            });
        }

        const verifiedEmail = transaction.customer?.email
            ?.trim()
            .toLowerCase();

        const paymentMatches =
            transaction.reference === localPayment.reference &&
            transaction.currency === localPayment.currency &&
            verifiedEmail === localPayment.customer_email &&
            Number.isSafeInteger(transaction.amount) &&
            transaction.amount ===
                Number(localPayment.amount_ghs_pesewas);

        if (!paymentMatches) {
            console.error(
                "Paystack verification mismatch:",
                reference
            );

            return res.status(409).json({
                success: false,
                message: "Verified transaction details do not match the payment record."
            });
        }

        client = await pool.connect();

        try {
            await client.query("BEGIN");

            const lockedResult = await client.query(
                `SELECT
                    id,
                    reference,
                    goal_id,
                    customer_email,
                    amount_ghs_pesewas,
                    amount_usd_cents,
                    currency,
                    status
                 FROM payments
                 WHERE reference = $1
                 FOR UPDATE`,
                [reference]
            );

            if (lockedResult.rowCount === 0) {
                throw new Error("Payment record disappeared.");
            }

            const payment = lockedResult.rows[0];

            if (payment.status === "success") {
                await client.query("COMMIT");

                return res.json({
                    success: true,
                    message: "Payment was already verified.",
                    status: "success"
                });
            }

            if (payment.status !== "pending") {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    success: false,
                    message: "Payment is no longer pending."
                });
            }

            let allocations;

            if (payment.goal_id) {
                allocations = [{
                    goalId: payment.goal_id,
                    amountUsdCents:
                        Number(payment.amount_usd_cents),
                    amountGhsPesewas:
                        Number(payment.amount_ghs_pesewas)
                }];
            } else {
                const goalResult = await client.query(
                    `SELECT id, name, target_usd_cents
                     FROM goals
                     WHERE is_active = TRUE
                     AND id = ANY($1::text[])
                     ORDER BY
                        CASE id
                            WHEN 'ps5' THEN 1
                            WHEN 'gta6' THEN 2
                            WHEN 'monitor' THEN 3
                            ELSE 4
                        END`,
                    [EXPECTED_GOALS]
                );

                const goals = goalResult.rows.map((goal) => ({
                    ...goal,
                    target_usd_cents:
                        Number(goal.target_usd_cents)
                }));

                if (
                    goals.length !== 3 ||
                    goals.some(
                        (goal) =>
                            !Number.isSafeInteger(
                                goal.target_usd_cents
                            ) ||
                            goal.target_usd_cents <= 0
                    )
                ) {
                    throw new Error(
                        "Cannot allocate payment: fundraising goals are unavailable."
                    );
                }

                allocations = buildAllocations(
                    "all",
                    Number(payment.amount_usd_cents),
                    Number(payment.amount_ghs_pesewas),
                    goals
                );
            }

            const allocatedUsd = allocations.reduce(
                (sum, item) => sum + item.amountUsdCents,
                0
            );

            const allocatedGhs = allocations.reduce(
                (sum, item) => sum + item.amountGhsPesewas,
                0
            );

            if (
                allocatedUsd !== Number(payment.amount_usd_cents) ||
                allocatedGhs !== Number(payment.amount_ghs_pesewas)
            ) {
                throw new Error(
                    "Contribution allocation totals do not match the payment."
                );
            }

            await client.query(
                `UPDATE payments
                 SET status = 'success',
                     paystack_transaction_id = $1,
                     paid_at = COALESCE($2::timestamptz, NOW()),
                     updated_at = NOW()
                 WHERE id = $3`,
                [
                    String(transaction.id),
                    transaction.paid_at || null,
                    payment.id
                ]
            );

            for (const allocation of allocations) {
                if (
                    allocation.amountUsdCents === 0 &&
                    allocation.amountGhsPesewas === 0
                ) {
                    continue;
                }

                await client.query(
                    `INSERT INTO contributions (
                        payment_id,
                        goal_id,
                        amount_usd_cents,
                        amount_ghs_pesewas
                    )
                    VALUES ($1, $2, $3, $4)`,
                    [
                        payment.id,
                        allocation.goalId,
                        allocation.amountUsdCents,
                        allocation.amountGhsPesewas
                    ]
                );
            }

            await client.query("COMMIT");

            return res.json({
                success: true,
                message: "Payment verified and contribution recorded.",
                goalId: payment.goal_id || "all",
                amountUsd:
                    Number(payment.amount_usd_cents) / 100,
                status: "success"
            });
        } catch (databaseError) {
            await client.query("ROLLBACK");
            throw databaseError;
        }
    } catch (error) {
        console.error(
            "Payment verification error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to complete payment verification."
        });
    } finally {
        if (client) {
            client.release();
        }
    }
});


/**
 * Get live fundraising totals for the public dashboard.
 * Only verified successful payments are counted.
 */
router.get("/dashboard", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                g.id,
                g.name,
                g.target_usd_cents,
                COALESCE(SUM(c.amount_usd_cents), 0) AS raised_usd_cents,
                COUNT(c.id) AS contribution_count
            FROM goals g
            LEFT JOIN contributions c
                ON c.goal_id = g.id
            LEFT JOIN payments p
                ON p.id = c.payment_id
                AND p.status = 'success'
            WHERE g.is_active = TRUE
            GROUP BY
                g.id,
                g.name,
                g.target_usd_cents
            ORDER BY
                CASE g.id
                    WHEN 'ps5' THEN 1
                    WHEN 'gta6' THEN 2
                    WHEN 'monitor' THEN 3
                    ELSE 4
                END
        `);

        const goals = result.rows.map((row) => {
            const targetCents = Number(row.target_usd_cents);
            const raisedCents = Number(row.raised_usd_cents);

            return {
                id: row.id,
                name: row.name,
                targetUsd: targetCents / 100,
                raisedUsd: raisedCents / 100,
                contributionCount: Number(row.contribution_count),
                progressPercent: targetCents > 0
                    ? Number(
                        ((raisedCents / targetCents) * 100).toFixed(2)
                    )
                    : 0
            };
        });

        const totalTargetCents = result.rows.reduce(
            (sum, row) => sum + Number(row.target_usd_cents),
            0
        );

        const totalRaisedCents = result.rows.reduce(
            (sum, row) => sum + Number(row.raised_usd_cents),
            0
        );

        return res.json({
            success: true,
            currency: "USD",
            goals,
            totals: {
                targetUsd: totalTargetCents / 100,
                raisedUsd: totalRaisedCents / 100,
                progressPercent: totalTargetCents > 0
                    ? Number(
                        ((totalRaisedCents / totalTargetCents) * 100).toFixed(2)
                    )
                    : 0
            }
        });

    } catch (error) {
        console.error("Dashboard data error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to load fundraising dashboard."
        });
    }
});


module.exports = router;
