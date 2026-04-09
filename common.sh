#!/usr/bin/env bash

die() {
  echo "Error: $*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  local display_name="$2"

  command -v "$command_name" >/dev/null 2>&1 || die "$display_name is required."
}

require_file() {
  local file_path="$1"
  local display_name="$2"

  [ -f "$file_path" ] || die "$display_name not found: $file_path"
}

build_codex_prompt() {
  local input_file="$1"
  local progress_file="$2"
  local instruction_file="$3"

  cat <<EOF
<checklist>
@$input_file
</checklist>

<progress_log>
@$progress_file
</progress_log>

<instructions>
@$instruction_file
</instructions>
EOF
}

resolve_input_file() {
  local raw_path="$1"
  local default_path="$2"
  local invocation_dir="$3"

  if [[ -n "$raw_path" ]]; then
    if [[ "$raw_path" = /* ]]; then
      printf '%s\n' "$raw_path"
    else
      printf '%s\n' "$invocation_dir/$raw_path"
    fi
    return
  fi

  printf '%s\n' "$default_path"
}

run_codex_pass() {
  local working_dir="$1"
  local input_file="$2"
  local progress_file="$3"
  local instruction_file="$4"
  local yolo="$5"
  local prompt

  prompt="$(build_codex_prompt "$input_file" "$progress_file" "$instruction_file")"

  if [[ "$yolo" == "true" ]]; then
    codex exec --dangerously-bypass-approvals-and-sandbox -C "$working_dir" "$prompt"
    return
  fi

  codex exec --full-auto --sandbox workspace-write -C "$working_dir" "$prompt"
}
