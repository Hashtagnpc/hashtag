
document.addEventListener("DOMContentLoaded", () => {

    // -----------------------------------------
    // API CONFIGURATION
    // -----------------------------------------

    const DASHBOARD_API =
        "http://192.168.0.172:3000/api/payments/dashboard";

    // -----------------------------------------
    // FORMATTING
    // -----------------------------------------

    const formatUSD = (amount) =>
        new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(Number(amount) || 0);

    function calculatePercentage(raised, target) {
        if (target <= 0) return 0;

        return Math.min(
            100,
            Math.max(0, (raised / target) * 100)
        );
    }

    // -----------------------------------------
    // UPDATE TEXT
    // -----------------------------------------

    function setText(selector, value) {
        document.querySelectorAll(selector).forEach((element) => {
            element.textContent = value;
        });
    }

    // -----------------------------------------
    // UPDATE HORIZONTAL PROGRESS BARS
    // -----------------------------------------

    function setBar(selector, percentage) {
        document.querySelectorAll(selector).forEach((element) => {
            element.style.width = `${percentage}%`;
            element.setAttribute(
                "aria-valuenow",
                percentage.toFixed(2)
            );
        });
    }

    // -----------------------------------------
    // UPDATE CIRCULAR PROGRESS
    // -----------------------------------------

    function updateCircularProgress(percentage) {
        document.querySelectorAll(".fund-circle").forEach((circle) => {

            circle.style.background = `
                conic-gradient(
                    #a477ff ${percentage}%,
                    #393247 ${percentage}%
                )
            `;

            const percentageText =
                circle.querySelector("[data-progress-percent]");

            if (percentageText) {
                percentageText.textContent =
                    `${percentage.toFixed(2)}%`;
            }
        });
    }

    // -----------------------------------------
    // UPDATE OVERALL FUNDRAISING TOTALS
    // -----------------------------------------

    function updateOverall(totals) {

        const raised = Number(totals.raisedUsd) || 0;
        const target = Number(totals.targetUsd) || 0;

        const remaining = Math.max(0, target - raised);

        const percentage = calculatePercentage(
            raised,
            target
        );

        // Raised amounts

        setText("[data-raised]", formatUSD(raised));
        setText("[data-total-raised]", formatUSD(raised));

        // Fundraising targets

        setText("[data-target]", formatUSD(target));
        setText("[data-total-target]", formatUSD(target));

        // Remaining amounts

        setText("[data-remaining]", formatUSD(remaining));

        setText(
            "[data-total-remaining]",
            `${formatUSD(remaining)} remaining`
        );

        // Progress percentages

        setText(
            "[data-progress-percent]",
            `${percentage.toFixed(2)}%`
        );

        // Horizontal overall progress bars

        setBar("[data-progress-bar]", percentage);

        // Circular homepage progress indicator

        updateCircularProgress(percentage);
    }

    // -----------------------------------------
    // UPDATE INDIVIDUAL FUNDRAISING GOALS
    // -----------------------------------------

    function updateGoals(goals) {

        goals.forEach((goal) => {

            const raised = Number(goal.raisedUsd) || 0;
            const target = Number(goal.targetUsd) || 0;

            const percentage = calculatePercentage(
                raised,
                target
            );

            const raisedText = formatUSD(raised);

            const percentageText =
                `${percentage.toFixed(2)}%`;

            // Homepage goal cards

            setText(
                `[data-item-raised="${goal.id}"]`,
                raisedText
            );

            setText(
                `[data-item-percent="${goal.id}"]`,
                percentageText
            );

            setBar(
                `[data-item-bar="${goal.id}"]`,
                percentage
            );

            // Support page goal cards

            setText(
                `[data-goal-raised="${goal.id}"]`,
                raisedText
            );

            setText(
                `[data-goal-percent="${goal.id}"]`,
                percentageText
            );

            setBar(
                `[data-goal-bar="${goal.id}"]`,
                percentage
            );
        });
    }

    // -----------------------------------------
    // LOAD DASHBOARD DATA
    // -----------------------------------------

    async function loadDashboard() {

        try {

            const response = await fetch(DASHBOARD_API, {
                method: "GET",

                headers: {
                    "Accept": "application/json"
                },

                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(
                    `Dashboard request failed: ${response.status}`
                );
            }

            const data = await response.json();

            if (
                !data.success ||
                !Array.isArray(data.goals) ||
                !data.totals
            ) {
                throw new Error(
                    "Invalid dashboard response."
                );
            }

            // Update all dashboard elements

            updateOverall(data.totals);
            updateGoals(data.goals);

            console.log(
                "Hashtag fundraising dashboard updated successfully.",
                data.totals
            );

        } catch (error) {

            console.error(
                "Could not load fundraising dashboard:",
                error
            );

        }
    }

    // -----------------------------------------
    // MAKE REFRESH AVAILABLE TO OTHER SCRIPTS
    // -----------------------------------------

    window.refreshHashtagDashboard = loadDashboard;

    // -----------------------------------------
    // LOAD DASHBOARD IMMEDIATELY
    // -----------------------------------------

    loadDashboard();

    // -----------------------------------------
    // AUTOMATIC REFRESH EVERY 60 SECONDS
    // -----------------------------------------

    const refreshInterval = window.setInterval(
        loadDashboard,
        60000
    );

    window.addEventListener("beforeunload", () => {
        window.clearInterval(refreshInterval);
    });

});
