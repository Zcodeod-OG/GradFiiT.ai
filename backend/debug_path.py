import sys
import os

print("--- DIAGNOSTIC REPORT ---")
print(f"1. Python Executable Running This Script:\n   {sys.executable}")
print(f"\n2. Python Version:\n   {sys.version}")
print(f"\n3. Where Python is looking for libraries (sys.path):")
for path in sys.path:
    print(f"   {path}")

print("\n--- TRYING TO IMPORT ---")
try:
    # REPLACE 'pandas' WITH THE NAME OF YOUR MISSING LIBRARY
    import numpy 
    print(f"SUCCESS: Library found at {numpy.__file__}")
except ImportError as e:
    print(f"FAILURE: {e}")