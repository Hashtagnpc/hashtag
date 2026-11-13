
const EXCHANGE_RATE_URL = "https://open.er-api.com/v6/latest/USD";

const CACHE_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MAX_STALE_AGE_MS = 36 * 60 * 60 * 1000;

let cachedRate = null;
let cachedUpdatedAt = null;
let refreshAt = 0;

async function getUsdGhsRate() {
    const now = Date.now();

    // Reuse the cached rate until shortly before its next update.
    if (cachedRate && now < refreshAt) {
        return {
            rate: cachedRate,
            updatedAt: cachedUpdatedAt,
            source: "ExchangeRate-API",
            cached: true
        };
    }

    try {
        const response = await fetch(EXCHANGE_RATE_URL, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            signal: AbortSignal.timeout(10000),
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Exchange rate API returned HTTP ${response.status}`);
        }

        const data = await response.json();

        if (
            data.result !== "success" ||
            data.base_code !== "USD" ||
            !Number.isFinite(data.rates?.GHS) ||
            data.rates.GHS <= 0 ||
            !Number.isFinite(data.time_last_update_unix) ||
            !Number.isFinite(data.time_next_update_unix)
        ) {
            throw new Error("Exchange rate API returned invalid data.");
        }

        const updatedAt = data.time_last_update_unix * 1000;
        const nextUpdateAt = data.time_next_update_unix * 1000;

        if (updatedAt > now + 5 * 60 * 1000) {
            throw new Error("Exchange rate update timestamp is invalid.");
        }

        if (now - updatedAt > MAX_STALE_AGE_MS) {
            throw new Error("Exchange rate data is too old.");
        }

        if (nextUpdateAt <= now) {
            throw new Error("Exchange rate data needs refreshing.");
        }

        cachedRate = data.rates.GHS;
        cachedUpdatedAt = new Date(updatedAt).toISOString();

        refreshAt = Math.max(
            now + 60 * 1000,
            nextUpdateAt - CACHE_REFRESH_BUFFER_MS
        );

        console.log(
            `USD/GHS rate updated: ${cachedRate}. ` +
            `Source update: ${cachedUpdatedAt}`
        );

        return {
            rate: cachedRate,
            updatedAt: cachedUpdatedAt,
            source: "ExchangeRate-API",
            cached: false
        };

    } catch (error) {
        console.error("Exchange rate retrieval failed:", error.message);

        // Only use a previously fetched rate if it is still reasonably fresh.
        if (
            cachedRate &&
            cachedUpdatedAt &&
            now - new Date(cachedUpdatedAt).getTime() <= MAX_STALE_AGE_MS
        ) {
            console.warn("Using previously cached USD/GHS rate.");

            return {
                rate: cachedRate,
                updatedAt: cachedUpdatedAt,
                source: "ExchangeRate-API",
                cached: true,
                staleFallback: true
            };
        }

        throw new Error(
            "A current USD/GHS exchange rate is unavailable. Payments are temporarily disabled."
        );
    }
}

module.exports = {
    getUsdGhsRate
};
