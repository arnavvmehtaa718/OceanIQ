"""OceanIQ - Reference configuration for the synthetic freight dataset.

IMPORTANT / HONESTY NOTE
========================
Everything in this module is a *prototype reference assumption* used to build a
clearly-labelled SYNTHETIC historical dataset. It is **not** SAIL data, **not**
Baltic Exchange data and **not** live market data. SAIL's real historical
fixtures are proprietary and were not available for this prototype.

The numbers are order-of-magnitude plausible public-domain dry-bulk figures so
that the trained model learns realistic relationships between route, season,
bunker prices, congestion and freight rates.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Global determinism
# ---------------------------------------------------------------------------

RANDOM_SEED = 20260915

# ---------------------------------------------------------------------------
# Time grid (weekly observations, Friday loadings)
# ---------------------------------------------------------------------------

SERIES_START = "2023-01-06"
SERIES_END = "2026-09-25"

# ---------------------------------------------------------------------------
# Discharge ports - East / East-South coast India
# ---------------------------------------------------------------------------
# Values are prototype reference assumptions (public-domain order of magnitude),
# NOT official SAIL berth limits.

PORTS: dict[str, dict] = {
    "Paradip": {
        "code": 0,
        "country": "India",
        "state": "Odisha",
        "lat": 20.2643,
        "lon": 86.6696,
        "max_draft_m": 14.5,
        "max_loa_m": 290.0,
        "max_beam_m": 45.0,
        "handling_tpd": 85000,
        "berths": 9,
        "congestion_base": 55.0,
        "waiting_base": 3.5,
        "congestion_amp": 16.0,
    },
    "Visakhapatnam": {
        "code": 1,
        "country": "India",
        "state": "Andhra Pradesh",
        "lat": 17.6954,
        "lon": 83.2953,
        "max_draft_m": 15.5,
        "max_loa_m": 300.0,
        "max_beam_m": 48.0,
        "handling_tpd": 90000,
        "berths": 12,
        "congestion_base": 30.0,
        "waiting_base": 1.8,
        "congestion_amp": 20.0,
    },
    "Gangavaram": {
        "code": 2,
        "country": "India",
        "state": "Andhra Pradesh",
        "lat": 17.6289,
        "lon": 83.315,
        "max_draft_m": 16.5,
        "max_loa_m": 310.0,
        "max_beam_m": 50.0,
        "handling_tpd": 95000,
        "berths": 7,
        "congestion_base": 25.0,
        "waiting_base": 1.2,
        "congestion_amp": 22.0,
    },
    "Gopalpur": {
        "code": 3,
        "country": "India",
        "state": "Odisha",
        "lat": 19.2627,
        "lon": 84.916,
        "max_draft_m": 12.5,
        "max_loa_m": 200.0,
        "max_beam_m": 32.0,
        "handling_tpd": 60000,
        "berths": 4,
        "congestion_base": 78.0,
        "waiting_base": 5.2,
        "congestion_amp": 12.0,
    },
    "Dhamra": {
        "code": 4,
        "country": "India",
        "state": "Odisha",
        "lat": 20.754,
        "lon": 86.9881,
        "max_draft_m": 14.0,
        "max_loa_m": 260.0,
        "max_beam_m": 42.0,
        "handling_tpd": 75000,
        "berths": 5,
        "congestion_base": 60.0,
        "waiting_base": 2.8,
        "congestion_amp": 18.0,
    },
    "Haldia": {
        "code": 5,
        "country": "India",
        "state": "West Bengal",
        "lat": 22.019,
        "lon": 88.137,
        "max_draft_m": 11.0,
        "max_loa_m": 180.0,
        "max_beam_m": 28.0,
        "handling_tpd": 55000,
        "berths": 6,
        "congestion_base": 82.0,
        "waiting_base": 6.1,
        "congestion_amp": 10.0,
    },
}

# ---------------------------------------------------------------------------
# Loading ports
# ---------------------------------------------------------------------------

ORIGINS: dict[str, dict] = {
    "Australia": {"code": 0, "region_factor": 1.00},
    "South Africa": {"code": 1, "region_factor": 0.86},
    "Indonesia": {"code": 2, "region_factor": 0.78},
    "Brazil": {"code": 3, "region_factor": 1.24},
    "USA": {"code": 4, "region_factor": 1.31},
    "Russia": {"code": 5, "region_factor": 1.12},
}

LOADING_PORTS: dict[str, dict] = {
    "Hay Point": {"country": "Australia", "lat": -21.2772, "lon": 149.2961},
    "Newcastle": {"country": "Australia", "lat": -32.9267, "lon": 151.7867},
    "Gladstone": {"country": "Australia", "lat": -23.843, "lon": 151.252},
    "Dampier": {"country": "Australia", "lat": -20.6564, "lon": 116.7122},
    "Richards Bay": {"country": "South Africa", "lat": -28.8, "lon": 32.05},
    "Saldanha": {"country": "South Africa", "lat": -33.01, "lon": 17.957},
    "Tanjung Bara": {"country": "Indonesia", "lat": 0.5896, "lon": 117.442},
    "Tarahan": {"country": "Indonesia", "lat": -5.5129, "lon": 105.4099},
    "Tubarao": {"country": "Brazil", "lat": -20.283, "lon": -40.2567},
    "Itaqui": {"country": "Brazil", "lat": -2.573, "lon": -44.3606},
    "Corpus Christi": {"country": "USA", "lat": 27.8073, "lon": -97.3932},
    "Nakhodka": {"country": "Russia", "lat": 42.8206, "lon": 132.883},
    "Murmansk": {"country": "Russia", "lat": 68.9711, "lon": 33.0922},
}

# ---------------------------------------------------------------------------
# Vessel classes
# ---------------------------------------------------------------------------
# Representative prototype characteristics (approximate industry ranges).

VESSEL_CLASSES: dict[str, dict] = {
    "Handysize": {
        "code": 0,
        "loa_m": 180.0,
        "beam_m": 28.0,
        "draft_m": 10.5,
        "dwt": 39000,
        "payload_t": 32000,
        "daily_rate_usd": 11200,
        "fuel_index": 0.72,
    },
    "Supramax": {
        "code": 1,
        "loa_m": 199.0,
        "beam_m": 32.3,
        "draft_m": 12.8,
        "dwt": 66000,
        "payload_t": 58000,
        "daily_rate_usd": 15000,
        "fuel_index": 1.00,
    },
    "Panamax": {
        "code": 2,
        "loa_m": 225.0,
        "beam_m": 32.3,
        "draft_m": 13.5,
        "dwt": 78000,
        "payload_t": 70000,
        "daily_rate_usd": 17200,
        "fuel_index": 1.14,
    },
    "Capesize": {
        "code": 3,
        "loa_m": 292.0,
        "beam_m": 45.0,
        "draft_m": 18.9,
        "dwt": 180000,
        "payload_t": 150000,
        "daily_rate_usd": 23800,
        "fuel_index": 2.05,
    },
}

VESSEL_ORDER = ["Handysize", "Supramax", "Panamax", "Capesize"]

# ---------------------------------------------------------------------------
# Cargo types
# ---------------------------------------------------------------------------

CARGO_TYPES: dict[str, dict] = {
    "Coal": {"code": 0, "weight_factor": 1.00, "demand_amp": 1.00},
    "Thermal Coal": {"code": 1, "weight_factor": 0.95, "demand_amp": 1.10},
    "Coking Coal": {"code": 2, "weight_factor": 1.05, "demand_amp": 0.78},
    "Iron Ore": {"code": 3, "weight_factor": 1.12, "demand_amp": 0.92},
    "Limestone": {"code": 4, "weight_factor": 0.88, "demand_amp": 0.66},
    "Steel Products": {"code": 5, "weight_factor": 1.18, "demand_amp": 0.72},
}

CARGO_ORDER = list(CARGO_TYPES)

# ---------------------------------------------------------------------------
# Lanes - (loading port, discharge port, vessel class, cargo mix)
# ---------------------------------------------------------------------------
# Each lane carries a great-circle distance in nautical miles (computed offline
# from the port coordinates above) which is the dominant long-run cost driver.

LANES: list[dict] = [
    # Australia -> East coast India
    {"origin": "Hay Point", "dest": "Paradip", "vessel": "Panamax", "cargo": ["Coal", "Iron Ore", "Thermal Coal"], "distance_nm": 6420.0},
    {"origin": "Hay Point", "dest": "Visakhapatnam", "vessel": "Panamax", "cargo": ["Coal", "Iron Ore"], "distance_nm": 6280.0},
    {"origin": "Hay Point", "dest": "Gangavaram", "vessel": "Capesize", "cargo": ["Iron Ore"], "distance_nm": 6255.0},
    {"origin": "Hay Point", "dest": "Haldia", "vessel": "Panamax", "cargo": ["Coal"], "distance_nm": 6710.0},
    {"origin": "Newcastle", "dest": "Paradip", "vessel": "Panamax", "cargo": ["Coal"], "distance_nm": 6580.0},
    {"origin": "Newcastle", "dest": "Gangavaram", "vessel": "Capesize", "cargo": ["Coal"], "distance_nm": 6415.0},
    {"origin": "Gladstone", "dest": "Paradip", "vessel": "Supramax", "cargo": ["Coal", "Limestone"], "distance_nm": 6700.0},
    {"origin": "Dampier", "dest": "Gopalpur", "vessel": "Supramax", "cargo": ["Limestone"], "distance_nm": 5180.0},
    # South Africa -> East coast India
    {"origin": "Richards Bay", "dest": "Paradip", "vessel": "Supramax", "cargo": ["Coal"], "distance_nm": 5200.0},
    {"origin": "Richards Bay", "dest": "Visakhapatnam", "vessel": "Supramax", "cargo": ["Coal"], "distance_nm": 5060.0},
    {"origin": "Richards Bay", "dest": "Haldia", "vessel": "Panamax", "cargo": ["Coal"], "distance_nm": 5490.0},
    {"origin": "Saldanha", "dest": "Haldia", "vessel": "Supramax", "cargo": ["Iron Ore"], "distance_nm": 5600.0},
    # Indonesia -> East coast India
    {"origin": "Tanjung Bara", "dest": "Paradip", "vessel": "Supramax", "cargo": ["Coal"], "distance_nm": 3800.0},
    {"origin": "Tanjung Bara", "dest": "Haldia", "vessel": "Handysize", "cargo": ["Coal"], "distance_nm": 4110.0},
    {"origin": "Tarahan", "dest": "Gopalpur", "vessel": "Handysize", "cargo": ["Limestone", "Coal"], "distance_nm": 4200.0},
    # Brazil -> East coast India
    {"origin": "Tubarao", "dest": "Paradip", "vessel": "Capesize", "cargo": ["Iron Ore"], "distance_nm": 8900.0},
    {"origin": "Tubarao", "dest": "Visakhapatnam", "vessel": "Capesize", "cargo": ["Iron Ore"], "distance_nm": 8740.0},
    {"origin": "Itaqui", "dest": "Haldia", "vessel": "Panamax", "cargo": ["Iron Ore"], "distance_nm": 9200.0},
    # Russia -> East coast India
    {"origin": "Nakhodka", "dest": "Paradip", "vessel": "Panamax", "cargo": ["Coal"], "distance_nm": 7800.0},
    {"origin": "Nakhodka", "dest": "Haldia", "vessel": "Panamax", "cargo": ["Coking Coal"], "distance_nm": 8090.0},
    {"origin": "Murmansk", "dest": "Visakhapatnam", "vessel": "Capesize", "cargo": ["Coal"], "distance_nm": 9800.0},
    # USA -> East coast India
    {"origin": "Corpus Christi", "dest": "Haldia", "vessel": "Panamax", "cargo": ["Steel Products", "Coal"], "distance_nm": 11200.0},
    {"origin": "Corpus Christi", "dest": "Paradip", "vessel": "Panamax", "cargo": ["Steel Products"], "distance_nm": 10950.0},
]

# ---------------------------------------------------------------------------
# Exogenous market drivers (synthetic but structurally realistic)
# ---------------------------------------------------------------------------

# VLSFO-style bunker index, USD/tonne. Long-run trend + seasonality + shocks.
# The trend is an ANNUAL compounding rate (exp(trend * years_elapsed)), so keep
# it modest: at 3.8% a year the index moves ~520 -> ~600 across the history
# window, which is the realistic order of magnitude for a VLSFO index.
BUNKER_BASE_USD_T = 520.0
BUNKER_TREND_PER_YEAR = 0.038
BUNKER_SEASON_AMP = 0.06

# Global seaborne dry-bulk demand index (100 = neutral)
DEMAND_BASE = 100.0
DEMAND_TREND_PER_WEEK = 0.075
DEMAND_SEASON_AMP = 0.085

# Market volatility proxy (0-100)
VOL_BASE = 34.0
VOL_SEASON_AMP = 0.22

# Indian utility / blast-furnace coal + ore import seasonality by month (0-11).
# Post-monsoon stocking (Oct-Dec) and pre-monsoon (Apr-Jun) are the peaks.
CARGO_MONTH_FACTOR: dict[str, list[float]] = {
    "Coal": [1.02, 0.96, 0.98, 1.05, 1.10, 1.08, 0.99, 0.97, 1.01, 1.09, 1.12, 1.08],
    "Thermal Coal": [1.05, 0.98, 1.00, 1.08, 1.14, 1.12, 1.01, 0.98, 1.03, 1.12, 1.16, 1.11],
    "Coking Coal": [0.98, 0.93, 0.95, 1.02, 1.07, 1.06, 0.97, 0.95, 0.99, 1.06, 1.09, 1.05],
    "Iron Ore": [1.00, 0.95, 0.96, 1.03, 1.08, 1.07, 0.98, 0.96, 1.00, 1.06, 1.10, 1.06],
    "Limestone": [0.96, 0.93, 0.96, 1.02, 1.06, 1.05, 0.98, 0.96, 1.00, 1.04, 1.07, 1.03],
    "Steel Products": [0.94, 0.92, 0.95, 1.01, 1.05, 1.04, 0.97, 0.95, 0.99, 1.05, 1.08, 1.02],
}