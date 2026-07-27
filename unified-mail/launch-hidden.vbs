' Runs "Unified Mail.bat" with no visible console window, so the app opens
' like a normal desktop program. This is what the desktop shortcut points at.
Set fso = CreateObject("Scripting.FileSystemObject")
projDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = projDir
' 0 = hidden window, False = don't wait for it to finish.
sh.Run """" & projDir & "\Unified Mail.bat""", 0, False
