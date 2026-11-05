# Token universe

The 107 tokens we track: every token in Kamino's verified list whose exact Solana mint RWA.xyz lists. Checked on 2026-11-05.

- **Kamino list:** `https://api.kamino.finance/tokens-api/tokens/?verified=true&limit=1000`, which held 531 tokens. Without `limit` it returns only 20.
- **Matching:** by exact mint only, because tickers collide (`W` is Wayfair and `PUMP` is ProPetro on RWA.xyz).
- **Symbol** is RWA.xyz's ticker, which is what we store. Kamino's differs for 10 tokens, shown in the last column.

Name, issuer and asset class haven't been checked against issuer sources.

| Symbol | Solana mint | Name | Issuer | Asset class | Kamino symbol |
| --- | --- | --- | --- | --- | --- |
| AAPLx | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | Apple xStock | Backed Assets | Stocks | AAPLx |
| ABBVx | `XswbinNKyPmzTa5CskMbCPvMW6G5CMnZXZEeQSSQoie` | AbbVie xStock | Backed Assets | Stocks | ABBVx |
| ABTx | `XsHtf5RpxsQ7jeJ9ivNewouZKJHbPxhPoEy6yYvULr7` | Abbott xStock | Backed Assets | Stocks | ABTx |
| ACNx | `Xs5UJzmCRQ8DWZjskExdSQDnbE6iLkRu2jjrRAB1JSU` | Accenture xStock | Backed Assets | Stocks | ACNx |
| AMBRx | `XsaQTCgebC2KPbf27KUhdv5JFvHhQ4GDAPURwrEhAzb` | AMBRx xStock | Backed Assets | Stocks | AMBRx |
| AMZNx | `Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg` | Amazon xStock | Backed Assets | Stocks | AMZNx |
| APPx | `XsPdAVBi8Zc1xvv53k4JcMrQaEDTgkGqKYeh7AYgPHV` | AppLovin xStock | Backed Assets | Stocks | APPx |
| AUSD | `AUSD1jCcCyPLybk1YnvPWsHQSrZ46dxwoMniN4N2UEB9` | AUSD | Agora | Stablecoins | AUSD |
| AUTO | `GNE6oDS6jHrfaV3GQVVCCp37fDnT7PiPuewMKBj2bqNm` | AUTO | Hastra | Asset-Backed Credit | AUTO |
| AVGOx | `XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo` | Broadcom xStock | Backed Assets | Stocks | AVGOx |
| AZNx | `Xs3ZFkPYT2BN7qBMqf1j1bfTeTm1rFzEFSsQ1z3wAKU` | AstraZeneca xStock | Backed Assets | Stocks | AZNx |
| BACx | `XswsQk4duEQmCbGzfqUUWYmi7pV7xpJ9eEmLHXCaEQP` | Bank of America xStock | Backed Assets | Stocks | BACx |
| BRK.Bx | `Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x` | Berkshire Hathaway xStock | Backed Assets | Stocks | BRK.Bx |
| CASH | `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` | CASH | Bridge | Stablecoins | CASH |
| CMCSAx | `XsvKCaNsxg2GN8jjUmq71qukMJr7Q1c5R2Mk9P8kcS8` | Comcast xStock | Backed Assets | Stocks | CMCSAx |
| COINx | `Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu` | Coinbase xStock | Backed Assets | Stocks | COINx |
| CRCLx | `XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1` | CRCLx xStock | Backed Assets | Stocks | CRCLx |
| CRMx | `XsczbcQ3zfcgAEt9qHQES8pxKAVG5rujPSHQEXi4kaN` | Salesforce xStock | Backed Assets | Stocks | CRMx |
| CRWDx | `Xs7xXqkcK7K8urEqGg52SECi79dRp2cEKKuYjUePYDw` | CrowdStrike xStock | Backed Assets | Stocks | CRWDx |
| CSCOx | `Xsr3pdLQyXvDJBFgpR5nexCEZwXvigb8wbPYp4YoNFf` | Cisco xStock | Backed Assets | Stocks | CSCOx |
| CVXx | `XsNNMt7WTNA2sV3jrb1NNfNgapxRF5i4i6GcnTRRHts` | Chevron xStock | Backed Assets | Stocks | CVXx |
| deJAAA | `AAASV2sCaykNGdEQzJ1mMVNfJMsgEtR7PJaqrCuk4bq6` | JAAA deRWA | Centrifuge | Corporate Credit | deJAAA |
| deJTRSY | `DeJXZwShCZYJnRX2ruVASfhUhsC44qPW1pacbxRFuGLR` | JTRSY deRWA | Centrifuge | US Treasury Debt | deJTRSY |
| DFDVx | `Xs2yquAgsHByNzx68WJC55WHjHBvG9JsMB7CWjTLyPy` | DFDV xStock | Backed Assets | Stocks | DFDVx |
| DHRx | `Xseo8tgCZfkHxWS9xbFYeKFyMSbWEvZGFV1Gh53GtCV` | Danaher xStock | Backed Assets | Stocks | DHRx |
| EURC | `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr` | EURC | Circle | Stablecoins | EURC |
| EURCV | `DghpMkatCiUsofbTmid3M3kAbDTPqDwKiYHnudXeGG52` | EUR CoinVertible | Societe Generale - FORGE | Stablecoins | EURCV |
| EUROe | `2VhjJ9WxaGC3EZFwJG9BDUs9KxKCAjQY4vgd1qxgYWVg` | EUROe | Membrane Finance | Stablecoins | EUROE |
| EUROP | `euro5sNHrZC2wu2RoLvy6xxoVMc3Qnd1vjxoWf4MftA` | EURØP | Schuman Financial | Stablecoins | EUROP |
| FDUSD | `9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u` | First Digital USD | FD121 (BVI) Limited | Stablecoins | FDUSD |
| FRXUSD | `GzX1ireZDU865FiMaKrdVB1H6AE8LAqWYCg6chrMrfBw` | Frax USD | Frax Finance | Stablecoins | frxusd |
| FWDI | `7GzQgf6DPo6ZANjnbhe9tNCpkGTv3zqHbsDx74jyQf9` | Forward Industries Inc. | Forward Industries | Stocks | FWDI |
| GLDx | `Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re` | Gold xStock | Backed Assets | Commodities | GLDx |
| GLXY | `2HehXG149TXuVptQhbiWAWDjbbuCsXSAtLTB5wc2aajK` | Galaxy Digital Inc. | Galaxy Digital | Stocks | GLXY |
| GMEx | `Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc` | Gamestop xStock | Backed Assets | Stocks | GMEx |
| GOLD | `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A` | GOLD | Gold Issuance Inc. | Commodities | GOLD |
| GOOGLx | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` | Alphabet xStock | Backed Assets | Stocks | GOOGLx |
| GSx | `XsgaUyp4jd1fNBCxgtTKkW64xnnhQcvgaxzsbAq5ZD1` | Goldman Sachs xStock | Backed Assets | Stocks | GSx |
| HDx | `XszjVtyhowGjSC5odCqBpW1CtXXwXjYokymrk7fGKD3` | Home Depot xStock | Backed Assets | Stocks | HDx |
| HONx | `XsRbLZthfABAPAfumWNEJhPyiKDW6TvDVeAeW7oKqA2` | Honeywell xStock | Backed Assets | Stocks | HONx |
| HOODx | `XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg` | Robinhood xStock | Backed Assets | Stocks | HOODx |
| hyUSD | `5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E` | Hylo USD | Hylo Protocol | Stablecoins | hyUSD |
| IBMx | `XspwhyYPdWVM8XBHZnpS9hgyag9MKjLRyE3tVfmCbSr` | International Business Machines xStock | Backed Assets | Stocks | IBMx |
| INTCx | `XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM` | Intel xStock | Backed Assets | Stocks | INTCx |
| JNJx | `XsGVi5eo1Dh2zUpic4qACcjuWGjNv8GCt3dm5XcX6Dn` | Johnson & Johnson xStock | Backed Assets | Stocks | JNJx |
| JPMx | `XsMAqkcKsUewDrzVkait4e5u4y8REgtyS7jWgCpLV2C` | JPMorgan Chase xStock | Backed Assets | Stocks | JPMx |
| JupUSD | `JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD` | JupUSD | Ethena | Stablecoins | JupUSD |
| KOx | `XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ` | Coca-Cola xStock | Backed Assets | Stocks | KOx |
| LINx | `XsSr8anD1hkvNMu8XQiVcmiaTP7XGvYu7Q58LdmtE8Z` | Linde xStock | Backed Assets | Stocks | LINx |
| LLYx | `Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH` | Eli Lilly xStock | Backed Assets | Stocks | LLYx |
| MAx | `XsApJFV9MAktqnAc6jqzsHVujxkGm9xcSUffaBoYLKC` | Mastercard xStock | Backed Assets | Stocks | MAx |
| MCDx | `XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2` | McDonald's xStock | Backed Assets | Stocks | MCDx |
| MDTx | `XsDgw22qRLTv5Uwuzn6T63cW69exG41T6gwQhEK22u2` | Medtronic xStock | Backed Assets | Stocks | MDTx |
| METAx | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu` | Meta xStock | Backed Assets | Stocks | METAx |
| MRKx | `XsnQnU7AdbRZYe2akqqpibDdXjkieGFfSkbkjX1Sd1X` | Merck xStock | Backed Assets | Stocks | MRKx |
| MRVLx | `XsuxRGDzbLjnJ72v74b7p9VY6N66uYgTCyfwwRjVCJA` | Marvell xStock | Backed Assets | Stocks | MRVLx |
| MSFTx | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` | Microsoft xStock | Backed Assets | Stocks | MSFTx |
| MSTRx | `XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ` | MicroStrategy xStock | Backed Assets | Stocks | MSTRx |
| nBASIS | `G6SkPqYTbtVFYU4krZLDgHf5MVMfARG57G1kog4RYH2n` | Nest Basis Vault | Plume Vaults | Active Strategies | nBASIS |
| NFLXx | `XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL` | Netflix xStock | Backed Assets | Stocks | NFLXx |
| nOPAL | `GArhnnDj3GYhmQeApKVXaRv4TQFwhPcs3SNF6FXsTeXq` | Nest BlackOpal LiquidStone II Vault | Plume Vaults | Asset-Backed Credit | nOPAL |
| NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | NVIDIA xStock | Backed Assets | Stocks | NVDAx |
| NVOx | `XsfAzPzYrYjd4Dpa9BU3cusBsvWfVB9gBcyGC87S57n` | Novo Nordisk xStock | Backed Assets | Stocks | NVOx |
| ONyc | `5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5` | OnRe Tokenized Reinsurance | OnRe | Specialty Finance | ONyc |
| ORCLx | `XsjFwUPiLofddX5cWFHW35GCbXcSu1BCUGfxoQAQjeL` | Oracle xStock | Backed Assets | Stocks | ORCLx |
| oTFY | `BwB3tNH92jKw6naNGDYDbDwRo8bvYxZVvZjRZRcoWR2h` | Obligate Trade Finance Yield | Verified SV | Asset-Backed Credit | oTFY |
| PAXG | `5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW` | Paxos Gold | Paxos | Commodities | PAXG |
| PEPx | `Xsv99frTRUeornyvCfvhnDesQDWuvns1M852Pez91vF` | PepsiCo xStock | Backed Assets | Stocks | PEPx |
| PFEx | `XsAtbqkAP1HJxy7hFDeq7ok6yM43DQ9mQ1Rh861X8rw` | Pfizer xStock | Backed Assets | Stocks | PFEx |
| PGx | `XsYdjDjNUygZ7yGKfQaB6TxLh2gC6RRjzLtLAGJrhzV` | Procter & Gamble xStock | Backed Assets | Stocks | PGx |
| PLTRx | `XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4` | Palantir xStock | Backed Assets | Stocks | PLTRx |
| PMx | `Xsba6tUnSjDae2VcopDB6FGGDaxRrewFCDa5hKn5vT3` | Philip Morris xStock | Backed Assets | Stocks | PMx |
| PRIME | `3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7` | PRIME | Hastra | Asset-Backed Credit | PRIME |
| PST | `59obFNBzyTBGowrkif5uK7ojS58vsuWz3ZCvg6tfZAGw` | PayFi Strategy Token | Huma | Asset-Backed Credit | PST |
| PYUSD | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | Paypal USD | Paxos | Stablecoins | PYUSD |
| QQQx | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` | Nasdaq xStock | Backed Assets | Stocks | QQQx |
| reUSD | `2uxaYT1fVrp6Fg2BrxQcyKSW91hefM6dG9krpbeDiirT` | reUSD | Resilience BVI Ltd. | Specialty Finance | reUSD |
| solmF-One | `ESS9fuAbDiyDXy6y1ZAt9VSaiGPSqG8NwaWVX7dePdR7` | Midas solmF-One | Midas | Asset-Backed Credit | solmFONE |
| SPYx | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | SP500 xStock | Backed Assets | Stocks | SPYx |
| STRCx | `Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH` | Strategy PP Variable xStock | Backed Assets | Stocks | STRCx |
| sUSDe | `Eh6XEPhSwoLv5wFApukmnaVSHQ6sAnoD9BmgmwQoN2sN` | Staked USDe | Ethena | Active Strategies | sUSD |
| syrupUSDC | `AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj` | Syrup USDC | Maple Protocol Pool Operations | Asset-Backed Credit | syrupUSDC |
| tGBP | `2zMqyX4AYCk6mgy5UZ2S7zUaLxwERhK5WjqDzkPPbSpW` | Tokenised GBP | BCP Technologies | Stablecoins | tGBP |
| TMOx | `Xs8drBWy3Sd5QY3aifG9kt9KFs2K3PGZmx7jWrsrk57` | Thermo Fisher xStock | Backed Assets | Stocks | TMOx |
| TONXx | `XscE4GUcsYhcyZu5ATiGUMmhxYa1D5fwbpJw4K6K4dp` | TON xStock | Backed Assets | Stocks | TONXx |
| TQQQx | `XsjQP3iMAaQ3kQScQKthQpx9ALRbjKAjQtHg6TFomoc` | TQQQ xStock | Backed Assets | Stocks | TQQQx |
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | Tesla xStock | Backed Assets | Stocks | TSLAx |
| UNHx | `XszvaiXGPwvk2nwb3o9C1CX4K6zH8sez11E6uyup6fe` | UnitedHealth xStock | Backed Assets | Stocks | UNHx |
| USD.infra | `dawn7ZUF7h7anFuEsDdAU1Y3HYwikwqNMAENZsQJdNL` | USD.infra | DAWN | Stablecoins | USD.tel |
| USD1 | `USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB` | USD1 | BitGo | Stablecoins | USD1 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | USDC | Circle International | Stablecoins | USDC |
| USDCV | `8smindLdDuySY6i2bStQX9o8DVhALCXCMbNxD98unx35` | USD CoinVertible | Societe Generale - FORGE | Stablecoins | USDCV |
| USDe | `DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT` | Ethena USDe | Ethena | Stablecoins | USDE |
| USDG | `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | Global Dollar | Paxos Digital Singapore | Stablecoins | USDG |
| USDS | `USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA` | USDS | Sky | Stablecoins | USDS |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | Tether USDt | Tether Holdings | Stablecoins | USDT |
| USDU | `9ckR7pPPvyPadACDTzLwK2ZAEeUJ3qGSnzPs8bVaHrSy` | Unitas USD | Unitas Labs | Stablecoins | USDu |
| USDY | `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` | Ondo U.S. Dollar Yield | Ondo Stocks | US Treasury Debt | USDY |
| USX | `6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG` | USX | USX Limited | Stablecoins | USX |
| VCHF | `AhhdRu5YZdjVkKR3wbnUDaymVQL2ucjMQ63sZ3LFHsch` | VNX Swiss Franc | VNX | Stablecoins | vCHF |
| VEUR | `C4Kkr9NZU3VbyedcgutU6LKmi6MKz81sx6gRmk5pX519` | VNX Euro | VNX | Stablecoins | vEUR |
| VNXAU | `9TPL8droGJ7jThsq4momaoz6uhTcvX2SeMqipoPmNa8R` | VNX Gold | VNX | Commodities | VNXAU |
| VTIx | `XsssYEQjzxBCFgvYFFNuhJFBeHNdLWYeUSP8F45cDr9` | Vanguard xStock | Backed Assets | Stocks | VTIx |
| Vx | `XsqgsbXwWogGJsNcVZ3TyVouy2MbTkfCFhCGGGcQZ2p` | Visa xStock | Backed Assets | Stocks | Vx |
| WMTx | `Xs151QeqTCiuKtinzfRATnUESM2xTU6V9Wy8Vy538ci` | Walmart xStock | Backed Assets | Stocks | WMTx |
| XAUT | `AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P` | Tether Gold | TG Commodities, S.A. de C.V. | Commodities | XAUt0 |
| XOMx | `XsaHND8sHyfMfsWPj6kSdd5VwvCayZvjYgKmmcNL5qh` | Exxon Mobil xStock | Backed Assets | Stocks | XOMx |

## Excluded

- **Kamino verified, no mint on RWA.xyz (424):** 118 of these share a ticker with an RWA.xyz record but aren't listed under that mint, including 79 Backpack stock tokens. The other 306 have no match at all.
- **Previously tracked, not in Kamino's verified list (8):** ACRED, BUIDL, NEAR, OUSG, USCC, USTB, USYC and XAUm.
