# Regression tests — worked values from the research

Every formula in the calculation core gets a test against a value already verified in the research documents. A data edit that silently moves a recommendation should fail here first.

## Core maths
1. **Chip load identity**: Vf 20,000 mm/min, n 20,000 rpm, Z 4 → fz = 0.25 mm/tooth (ITA reconciliation, total-flute reading; Z 3 upcut-only → 0.333).
2. **Feed conversion**: 500 IPM ÷ 39.37 = 12.70 m/min. Guard: ÷ 25.4 (= 19.69) must NOT be used.
3. **Chip load conversion**: 0.019 in/tooth × 25.4 = 0.483 mm/tooth.
4. **Surface speed**: D 12 mm, n 18,000 → Vc = 678.6 m/min.

## Power and torque
5. **Worked slot**: kc 35 N/mm², ap 18 × ae 12 mm, Vf 20,000 mm/min → MRR 4.32×10⁶ mm³/min, P = 2.52 kW.
6. **Torque at breakpoint**: 10 kW at 12,000 rpm → 7.96 Nm.
7. **Below-breakpoint derate**: 10 kW, bp 12,000, at 6,000 rpm → 5.0 kW available.
8. **kc(h) small chip, straight MDF**: Ks 31.44, Int 3.36, h 0.041 → kc = 113 N/mm² (±1).
9. **kc(h) spiral flatness**: any spiral_30 model, h 0.04 vs 1.0 → kc ratio = 1.0 (Int = 0).

## Limiters
10. **Chip thinning**: D 12, ae 3 (25%) → factor D/(2√(ae(D−ae))) = 1.155.
11. **Corner distance**: 20 m/min (0.333 m/s), a 2 m/s² → L = 55.6 mm.
12. **Vacuum grip**: μ 0.4, ΔP 5 kPa, area 100 cm² → 20 N lateral (within the 12–28 N band).
13. **Compression minimum depth**: up-cut 0.5″ → minimum pass 0.563″ = 14.3 mm.
14. **Depth derating chain**: Onsrud 48-000 MDF 12.7 mm (0.152–0.203) at 2×D → 0.114–0.152 mm/tooth.

## Data integrity
15. **Onsrud lookup**: 60-100C, hardwood, 12.7 mm → 0.533–0.584 mm/tooth.
16. **Within-vendor geometry spread**: 48-000 vs 60-100C hardwood 12.7 mm → ratio ≈ 3.0–3.2 (both entries must exist; the spread is a feature, not a bug).
17. **OSB**: any OSB request → refusal with reason, never a number.
18. **Species bounds**: density 250 or 1,200 kg/m³ → warning, model flagged out of validity (287–1,080).
19. **Every entry has provenance**: no entry without `source` and `data_class`; ITA entries must carry the flute-basis switch.
20. **Speed uplift tag**: every `iwms25` kc row must surface the +15–20% production-speed caveat in output.
