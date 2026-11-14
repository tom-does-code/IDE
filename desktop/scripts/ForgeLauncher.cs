using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
class ForgeLauncher {
  [STAThread] static void Main(string[] args) {
    try {
      string root=AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
      string desktop=Path.Combine(root,"desktop");
      var process=new ProcessStartInfo(Path.Combine(desktop,"node_modules","electron","dist","electron.exe"));
      process.WorkingDirectory=desktop;
      process.UseShellExecute=false;
      process.CreateNoWindow=true;
      process.WindowStyle=ProcessWindowStyle.Hidden;
      process.Arguments="\""+desktop+"\" --plugins=\"local-dir:"+Path.Combine(root,"plugins")+"\" --hostname=127.0.0.1 --port=0";
      foreach(string arg in args) { if(arg.IndexOf('"')>=0)throw new ArgumentException("Invalid path argument");process.Arguments+=" \""+arg.TrimEnd('\\')+"\""; }
      process.EnvironmentVariables["FORGE_HOME"]=root;
      process.EnvironmentVariables["THEIA_CONFIG_DIR"]=Path.Combine(root,"data");
      process.EnvironmentVariables.Remove("FORGE_TEST");
      process.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
      Process.Start(process);
    } catch(Exception error) { MessageBox.Show(error.Message,"Forge PHP could not start",MessageBoxButtons.OK,MessageBoxIcon.Error); }
  }
}
