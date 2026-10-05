"""Compatibility entry point; use sfc benchmark for the installed command."""
from agent.cli import main
import sys
sys.exit(main(["benchmark", *sys.argv[1:]]))
