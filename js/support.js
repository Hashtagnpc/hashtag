
document.addEventListener("DOMContentLoaded", () => {
    // --------------------------------
    // Amount controls
    // --------------------------------

    const amountInput = document.getElementById("custom-amount");
    const selectedAmount = document.getElementById("selected-amount");
    const stepperButtons = document.querySelectorAll(".amount-stepper");
    const presetButtons = document.querySelectorAll(".amount-option");

    // --------------------------------
    // Payment elements
    // --------------------------------

    const goalSelect = document.getElementById("contribution-goal");
    const payButton = document.getElementById("pay-now");
    const paymentMessage = document.getElementById("payment-message");

    // IMPORTANT:
    // This is your computer's local network IP address.
    // Your phone uses this address to reach your backend.
    const API_BASE_URL = "http://192.168.0.172:3000/api/payments";

    if (!amountInput || !selectedAmount) {
        console.error("Contribution amount elements were not found.");
        return;
    }

    if (!goalSelect || !payButton || !paymentMessage) {
        console.error("Payment form elements were not found.");
        return;
    }

    const MIN_AMOUNT = Number(amountInput.min) || 1;
    const MAX_AMOUNT = Number(amountInput.max) || 100000;
    const STEP = Number(amountInput.step) || 1;

    const formatUSD = (amount) =>
        new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD"
        }).format(amount);

    // --------------------------------
    // Update contribution amount
    // --------------------------------

    function updateAmount(value) {
        let amount = Number(value);

        if (!Number.isFinite(amount)) {
            amount = MIN_AMOUNT;
        }

        amount = Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, amount));
        amount = Math.round(amount * 100) / 100;

        amountInput.value = String(amount);
        selectedAmount.textContent = formatUSD(amount);

        presetButtons.forEach((button) => {
            const preset = Number(button.dataset.amount);
            button.classList.toggle("active", preset === amount);
        });
    }

    // Stepper buttons

    stepperButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const direction = Number(button.dataset.step);

            if (!Number.isFinite(direction) || direction === 0) {
                return;
            }

            const currentAmount =
                Number(amountInput.value) || MIN_AMOUNT;

            updateAmount(currentAmount + direction * STEP);
        });
    });

    // Preset amount buttons

    presetButtons.forEach((button) => {
        button.addEventListener("click", () => {
            updateAmount(button.dataset.amount);
        });
    });

    // Manual amount input

    amountInput.addEventListener("input", () => {
        const value = amountInput.value;

        if (value !== "" && Number.isFinite(Number(value))) {
            const amount = Number(value);

            selectedAmount.textContent = formatUSD(amount);

            presetButtons.forEach((button) => {
                button.classList.toggle(
                    "active",
                    Number(button.dataset.amount) === amount
                );
            });
        }
    });

    amountInput.addEventListener("change", () => {
        updateAmount(amountInput.value);
    });

    updateAmount(amountInput.value);

    // --------------------------------
    // Payment message helper
    // --------------------------------

    function showMessage(message, type = "info") {
        paymentMessage.textContent = message;
        paymentMessage.className = `payment-message ${type}`;
    }

    // --------------------------------
    // Restore Pay Now button
    // --------------------------------

    function restorePayButton() {
        payButton.disabled = false;
        payButton.textContent = "Pay Now";
    }

    // --------------------------------
    // Verify successful payment
    // --------------------------------

    async function verifyPayment(transactionReference) {
        showMessage(
            "Payment received. Confirming it securely...",
            "info"
        );

        try {
            const verifyResponse = await fetch(
                `${API_BASE_URL}/verify/${encodeURIComponent(transactionReference)}`,
                {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    },
                    cache: "no-store"
                }
            );

            const verifyResult = await verifyResponse.json();

            // Support both possible backend response formats.
            const paymentStatus =
                verifyResult.status ||
                verifyResult.payment?.status;

            if (
                verifyResponse.ok &&
                verifyResult.success &&
                paymentStatus === "success"
            ) {
                showMessage(
                    "Thank you! Your contribution was successfully confirmed.",
                    "success"
                );

                // Refresh fundraising dashboard immediately.
                if (
                    typeof window.refreshHashtagDashboard === "function"
                ) {
                    window.refreshHashtagDashboard();
                }

            } else {
                showMessage(
                    verifyResult.message ||
                    "We could not confirm your payment yet. Please contact us if your account was charged.",
                    "error"
                );
            }

        } catch (error) {
            console.error("Payment verification error:", error);

            showMessage(
                "We couldn't confirm your payment just yet. Please contact us if your account was charged.",
                "error"
            );

        } finally {
            restorePayButton();
        }
    }

    // --------------------------------
    // Initialize Paystack payment
    // --------------------------------

    async function initializePayment() {
        const amount = Number(amountInput.value);
        const goalId = goalSelect.value;

        // Validate amount

        if (!Number.isFinite(amount) || amount < MIN_AMOUNT) {
            showMessage(
                "Please enter a valid contribution amount.",
                "error"
            );
            return;
        }

        if (amount > MAX_AMOUNT) {
            showMessage(
                "Your contribution exceeds the allowed amount.",
                "error"
            );
            return;
        }

        const amountUsdCents = Math.round(amount * 100);

        if (
            !Number.isSafeInteger(amountUsdCents) ||
            amountUsdCents <= 0
        ) {
            showMessage(
                "Please enter a valid contribution amount.",
                "error"
            );
            return;
        }

        // Check Paystack SDK

        if (typeof window.PaystackPop !== "function") {
            showMessage(
                "The secure payment service could not load. Please refresh the page and try again.",
                "error"
            );
            return;
        }

        payButton.disabled = true;
        payButton.textContent = "Preparing payment...";

        showMessage(
            "Preparing your secure card payment...",
            "info"
        );

        try {
            // Ask backend to initialize transaction.

            const response = await fetch(
                `${API_BASE_URL}/initialize`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        goalId,
                        amountUsdCents
                    })
                }
            );

            const result = await response.json();

            if (
                !response.ok ||
                !result.success ||
                !result.payment
            ) {
                throw new Error(
                    result.message ||
                    "Could not initialize your payment."
                );
            }

            const { accessCode, reference } = result.payment;

            if (!accessCode || !reference) {
                throw new Error(
                    "The payment server did not return the required payment details."
                );
            }

            showMessage(
                "Opening secure card payment...",
                "info"
            );

            // Open Paystack Inline on the current page.

            const popup = new window.PaystackPop();

            let verificationStarted = false;

            popup.resumeTransaction(accessCode, {
                onSuccess: (transaction) => {
                    if (verificationStarted) {
                        return;
                    }

                    verificationStarted = true;

                    const transactionReference =
                        transaction?.reference || reference;

                    verifyPayment(transactionReference);
                },

                onCancel: () => {
                    showMessage(
                        "Payment was cancelled. You can try again whenever you're ready.",
                        "info"
                    );

                    restorePayButton();
                },

                onError: (error) => {
                    console.error("Paystack payment error:", error);

                    showMessage(
                        "Something went wrong with the payment. Please try again.",
                        "error"
                    );

                    restorePayButton();
                }
            });

        } catch (error) {
            console.error("Payment initialization error:", error);

            showMessage(
                error.message ||
                "Unable to start your payment. Please try again.",
                "error"
            );

            restorePayButton();
        }
    }

    // --------------------------------
    // Pay Now button event
    // --------------------------------

    payButton.addEventListener("click", initializePayment);

});
