Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\stock assistant"
WshShell.Run "cmd /c npm run electron:dev", 0, False
