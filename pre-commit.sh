#!/bin/sh

# Check if there are staged Rust files
rust_files_changed=false
if git diff --cached --name-only | grep -E '\.rs$' > /dev/null; then
  rust_files_changed=true
  echo "Rust files detected, running cargo fmt..."
  
  # Run cargo fmt on the entire project (safer than targeting specific files)
  cd src-tauri
  cargo fmt
  cargo_exit_code=$?
  cd ..
  
  # Stage any formatting changes
  git add -u
  
  if [ $cargo_exit_code -ne 0 ]; then
    echo "Error: cargo fmt failed"
    exit $cargo_exit_code
  fi
fi

# Run Biome check with auto-fix (includes formatting and safe fixes like import sorting)
echo "Running Biome check with auto-fix..."
output=$(npx biome check --write --staged 2>&1)
exit_code=$?

# Stage fixed files
git add -u

if [ $exit_code -eq 0 ]; then
  # If Rust files were formatted but Biome had no changes, still exit 0
  if [ "$rust_files_changed" = true ]; then
    echo "Rust files formatted successfully."
  fi
  exit 0
fi

case "$output" in
  *"No files were processed"*)
    # If only Rust files were changed and formatted, exit 0
    if [ "$rust_files_changed" = true ]; then
      echo "Rust files formatted successfully."
      exit 0
    fi
    exit 0
    ;;
  *)
    echo "$output"
    exit $exit_code
    ;;
esac
