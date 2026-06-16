@echo off
cd /d "%~dp0"
set "NODE_EXE=C:\Program Files\WindowsApps\OpenAI.Codex_26.519.11010.0_x64__2p2nqsd0c76g0\app\resources\node.exe"
"%NODE_EXE%" server.js
pause
