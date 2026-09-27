# Health Checker

> Connect your Google Ads account. Get a grade from 0 to 100. See exactly what to fix.

Health Checker is a free, open-source audit tool by [Quarizmi](https://quarizmi.com). Connect a Google Ads account and it instantly grades the whole account from 0 to 100, breaks that grade down into three areas, and gives you concrete recommendations to improve it.

---

## Your grade

Health Checker scores the **entire account**, not a single campaign:

| Area | What it looks at |
|---|---|
| **Configuration** | How well the account is set up |
| **Performance** | How well the account is performing |
| **Potential** | How much room there is to grow |

These roll up into a single **overall score from 0 to 100**.

```
 Connect Google Ads ──► Analyze account ──► Score: Configuration · Performance · Potential
                                                      │
                                                      ▼
                                          Overall grade (0–100) + recommendations
```

## Features

- **Instant grade** — results right after connecting, no manual setup.
- **Three-part breakdown** — see where the account is strong and where it's weak.
- **Actionable recommendations** — specific changes you can make to raise the score.
- **Standalone** — runs independently of the rest of the Quarizmi suite.

## Getting started

> **Note:** The implementation language and setup steps are still being finalized. This section will be updated.

### Prerequisites

- Google Ads API access (developer token + OAuth credentials)
- _TBD: runtime and dependencies_

### Installation

```bash
git clone https://github.com/<org>/health-checker.git
cd health-checker
# TBD: install dependencies
```

### Configuration

```bash
# TBD: environment variables / config file for API credentials
```

### Running

```bash
# TBD: run command
```

## Fix it yourself, or work with us

Every recommendation is yours to implement. If you'd rather have experts handle it, Quarizmi can implement the recommendations for you. Get in touch at **[quarizmi.com](https://quarizmi.com)**.

## Related projects

Health Checker is a standalone tool. Quarizmi also maintains an open-source paid-search suite built around long-tail keywords:

- **[EKEP](../ekep)** — discovers long-tail keywords
- **[Bidbot](../bidbot)** — decides bids and which keywords to turn on or off
- **[Usable](../usable)** — builds full campaigns with the user in the loop
- **[Magneto](../magneto)** — writes high-relevance ads for every keyword

## Contributing

Contributions are welcome. Please open an issue to discuss a change before submitting a pull request.

## License

Released under the [MIT License](LICENSE). © 2026 Quarizmi AdTech.
