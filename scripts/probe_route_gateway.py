"""Instrument the owned entry only in routing probes; the production entry is unchanged."""
import runpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from probe_route_trace import install
install()
runpy.run_path(str(Path(__file__).with_name("owned_gateway.py")), run_name="__main__")
