# Research Methodology

The benchmark lane is distinct from product analysis. It uses frozen datasets, evidence packages, prompt/model profiles, randomization seeds, budget protocols, invocation accounting, evaluation records, and statistical comparisons. `CONTROLLED_EVIDENCE` holds evidence constant to isolate configuration effects; `END_TO_END` records broader pipeline confounders. Human evaluation can blind output order and LLM-as-judge output must be treated as an evaluator with bias, not ground truth.

For each hypothesis, pre-register the variants, inclusion/exclusion rules, provider/model identifiers, exact local hardware/quantization where relevant, repetitions, budgets, metric definitions, and statistical correction. Report provider failures, missing observations, confidence intervals, practical effect sizes, and limits alongside any p-values. Retain the reproducibility export as the primary source for all tables and charts.

Do not infer quality from synthetic fixtures, UI availability, a single anecdote, or an unverified test run. The current hypothesis status is **NOT EVALUATED** because no actual benchmark source artifact has been supplied.
