
"use strict";

/* =========================================
   HASHTAG WEBSITE CONFIGURATION
========================================= */

const CONFIG = {
  items: [
    { id: "ps5", name: "PlayStation 5 Pro", price: 899, raised: 0 },
    { id: "gta6", name: "Grand Theft Auto VI", price: 79.99, raised: 0 },
    { id: "monitor", name: "Samsung Odyssey G7 G70D 27-inch", price: 499.99, raised: 0 }
  ],

  businessEmail: "deeclercq@gmail.com",
  contactEndpoint: "",
  paymentsEnabled: false
};

const formatMoney = amount =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);

function getTotals() {
  const target = CONFIG.items.reduce((sum, item) => sum + item.price, 0);
  const raised = CONFIG.items.reduce((sum, item) => sum + item.raised, 0);

  return {
    target,
    raised,
    remaining: Math.max(0, target - raised),
    percentage: target ? Math.min(100, raised / target * 100) : 0
  };
}

/* =========================================
   UPDATE ALL FUNDRAISING DISPLAYS
========================================= */

function updateFundraisingDisplay() {
  const totals = getTotals();

  CONFIG.items.forEach(item => {
    const percentage = item.price
      ? Math.min(100, item.raised / item.price * 100)
      : 0;

    const bar = document.querySelector(
      `[data-item-bar="${item.id}"]`
    );

    const raised = document.querySelector(
      `[data-item-raised="${item.id}"]`
    );

    const percent = document.querySelector(
      `[data-item-percent="${item.id}"]`
    );

    if (bar) bar.style.width = `${percentage}%`;
    if (raised) raised.textContent = formatMoney(item.raised);
    if (percent) percent.textContent = `${Math.round(percentage)}%`;
  });

  const values = {
    "data-total-target": formatMoney(totals.target),
    "data-total-raised": formatMoney(totals.raised),
    "data-total-remaining": formatMoney(totals.remaining),
    "data-target": formatMoney(totals.target),
    "data-raised": `${formatMoney(totals.raised)} raised`,
    "data-remaining": formatMoney(totals.remaining),
    "data-progress-percent": `${Math.round(totals.percentage)}%`
  };

  Object.entries(values).forEach(([attribute, value]) => {
    document.querySelectorAll(`[${attribute}]`).forEach(element => {
      element.textContent = value;
    });
  });

  document.querySelectorAll("[data-progress-bar]").forEach(bar => {
    bar.style.width = `${totals.percentage}%`;
  });

  const circle = document.querySelector(".fund-circle");

  if (circle) {
    circle.style.background =
      `conic-gradient(#a477ff ${totals.percentage}%, #393247 ${totals.percentage}%)`;
  }
}

/* =========================================
   MOBILE NAVIGATION
========================================= */

function initializeNavigation() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");

  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");

    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.textContent = isOpen ? "✕" : "☰";
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "☰";
    });
  });

  document.addEventListener("click", event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "☰";
    }
  });
}

/* =========================================
   SHARE WEBSITE
========================================= */

function initializeSharing() {
  const button = document.getElementById("share-button");
  const feedback = document.getElementById("share-feedback");

  if (!button || !feedback) return;

  button.addEventListener("click", async () => {
    const shareData = {
      title: "Support Hashtag",
      text: "Help me make it happen! Every contribution brings me closer to my goal.",
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        feedback.textContent = "Thank you for sharing! 💜";
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        feedback.textContent = "Link copied! Thank you! 💜";
      } else {
        feedback.textContent = "Please copy the website URL manually.";
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        feedback.textContent = "Unable to share right now.";
      }
    }
  });
}

/* =========================================
   CONTACT FORM
========================================= */

function initializeContactForm() {
  const form = document.getElementById("contact-form");
  const feedback = document.getElementById("form-feedback");

  if (!form || !feedback) return;

  const button = form.querySelector('[type="submit"]');

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const formData = new FormData(form);

    const data = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      message: String(formData.get("message") || "").trim()
    };

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !data.name ||
      !emailPattern.test(data.email) ||
      !data.subject ||
      !data.message
    ) {
      feedback.textContent = "Please complete all fields correctly.";
      feedback.className = "form-feedback error";
      return;
    }

    if (!CONFIG.contactEndpoint) {
      feedback.textContent =
        "Message delivery has not been configured yet. Please contact the website owner directly.";
      feedback.className = "form-feedback error";
      return;
    }

    button.disabled = true;
    button.classList.add("loading");
    button.textContent = "Sending...";

    try {
      const response = await fetch(CONFIG.contactEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error("Submission failed");

      feedback.textContent = "Message submitted successfully. Thank you!";
      feedback.className = "form-feedback success";
      form.reset();

    } catch (error) {
      feedback.textContent = "Unable to send your message. Please try again.";
      feedback.className = "form-feedback error";

    } finally {
      button.disabled = false;
      button.classList.remove("loading");
      button.textContent = "Send Message ↗";
    }
  });
}

/* =========================================
   CONTRIBUTION AMOUNT SELECTOR
========================================= */


function initializeAmountSelector() {
  const options = document.querySelectorAll(".amount-option");
  const customInput = document.getElementById("custom-amount");
  const display = document.getElementById("selected-amount");
  const stepButtons = document.querySelectorAll(".step-button");

  if (!display) return;

  let selectedAmount = 5;

  function updateAmount(amount, updateInput = false) {
    if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
      display.textContent = "Enter $1 to $100,000";
      return false;
    }

    selectedAmount = Math.round(amount * 100) / 100;
    display.textContent = formatMoney(selectedAmount);

    if (updateInput && customInput) {
      customInput.value = selectedAmount.toFixed(2);
    }

    options.forEach(option => {
      option.classList.remove("selected");
      option.setAttribute("aria-pressed", "false");
    });

    return true;
  }

  function updateStepperState() {
    if (!customInput) return;

    const amount = Number(customInput.value);

    stepButtons.forEach(button => {
      const direction = Number(button.dataset.step);

      button.disabled =
        !Number.isFinite(amount) ||
        (direction < 0 && amount <= 1) ||
        (direction > 0 && amount >= 100000);
    });
  }

  options.forEach(option => {
    option.addEventListener("click", () => {
      const amount = Number(option.dataset.amount);

      if (!updateAmount(amount, true)) return;

      option.classList.add("selected");
      option.setAttribute("aria-pressed", "true");

      updateStepperState();
    });
  });

  if (customInput) {
    customInput.addEventListener("input", () => {
      const amount = Number(customInput.value);

      if (customInput.value === "") {
        display.textContent = "Enter an amount";
      } else {
        updateAmount(amount);
      }

      updateStepperState();
    });

    customInput.addEventListener("change", () => {
      if (customInput.value === "") return;

      const amount = Number(customInput.value);

      if (updateAmount(amount, true)) {
        updateStepperState();
      }
    });
  }

  stepButtons.forEach(button => {
    button.addEventListener("click", () => {
      if (!customInput) return;

      const currentAmount = Number(customInput.value);

      if (!Number.isFinite(currentAmount)) return;

      const direction = Number(button.dataset.step);
      const nextAmount = Math.round(
        (currentAmount + direction) * 100
      ) / 100;

      if (updateAmount(nextAmount, true)) {
        updateStepperState();
      }
    });
  });

  updateStepperState();
}

/* =========================================
   FOOTER YEAR
========================================= */

function initializeFooter() {
  document.querySelectorAll("[data-year]").forEach(element => {
    element.textContent = new Date().getFullYear();
  });
}



/* =========================================
   CONTRIBUTION GOAL SELECTION
========================================= */

function initializeGoalSelector() {
  const selector = document.getElementById("contribution-goal");
  const note = document.getElementById("goal-selection-note");

  if (!selector || !note) return;

  const messages = {
    all: "Your contribution will be directed towards all three goals.",
    ps5: "You're helping make the PlayStation 5 Pro a reality.",
    gta6: "You're helping make Grand Theft Auto VI possible.",
    monitor: "You're helping complete the setup with a monitor."
  };

  selector.addEventListener("change", () => {
    note.textContent = messages[selector.value] || messages.all;
  });
}


/* =========================================
   INITIALIZE WEBSITE
========================================= */

document.addEventListener("DOMContentLoaded", () => {
  updateFundraisingDisplay();
  initializeNavigation();
  initializeSharing();
  initializeContactForm();
  initializeAmountSelector();
  initializeFooter();
  initializeGoalSelector();
});
