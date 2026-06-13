#!/usr/bin/env bash

SKILL_PATH=".github/skills/handbook"
EVALS_FILE=".github/skills/handbook/evals/evals.json"
WORKSPACE="handbook-workspace"

model_count=$(jq '.models | length' "$EVALS_FILE")
eval_count=$(jq '.evals | length' "$EVALS_FILE")

for m in $(seq 0 $((model_count - 1))); do
  model=$(jq -r ".models[$m]" "$EVALS_FILE")

  for i in $(seq 0 $((eval_count - 1))); do
    name=$(jq -r ".evals[$i].name" "$EVALS_FILE")
    prompt=$(jq -r ".evals[$i].prompt" "$EVALS_FILE")
    dir="eval-${name}"

    echo "==> Model: $model | Eval: $dir"

    copilot --model "$model" -p "Execute this task:
- Skill path: $SKILL_PATH
- Task: $prompt
- Save outputs to: $WORKSPACE/$model/$dir/with_skill/outputs/" --allow-all-tools

  done
done