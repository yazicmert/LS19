@echo off
rem LS19 (Look Star 19) - Windows: cift tikla. sunucu.py'yi baslatir ve tarayicida acar.
rem Python 3 gerekir (python.org; kurulumda "py launcher" secili kalsin). Farkli kapi: set LS19_PORT=9000
cd /d "%~dp0"
if "%LS19_PORT%"=="" set LS19_PORT=8765
set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY (
  where python >nul 2>nul && set PY=python
)
if not defined PY (
  echo Python 3 bulunamadi. https://www.python.org/downloads/ adresinden kurun ve yeniden deneyin.
  pause
  exit /b 1
)
echo LS19: http://localhost:%LS19_PORT%  (kapatmak icin bu pencerede Ctrl+C)
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:%LS19_PORT%/index.html"
%PY% sunucu.py
pause
