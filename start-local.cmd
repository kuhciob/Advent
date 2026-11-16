@echo off
rem Local preview: double-click this file. Requires Python. Close the window to stop.
cd /d "%~dp0"
start "" http://localhost:8080/
python -m http.server 8080
