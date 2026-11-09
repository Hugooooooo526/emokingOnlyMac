using System;
using System.Runtime.InteropServices;

sealed class JsHost : IDisposable
{
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate IntPtr NativeFunction(IntPtr callee, [MarshalAs(UnmanagedType.I1)] bool construct,
        IntPtr arguments, ushort count, IntPtr state);

    [DllImport("Chakra.dll")] static extern int JsCreateRuntime(int flags, IntPtr callback, out IntPtr runtime);
    [DllImport("Chakra.dll")] static extern int JsCreateContext(IntPtr runtime, out IntPtr context);
    [DllImport("Chakra.dll")] static extern int JsSetCurrentContext(IntPtr context);
    [DllImport("Chakra.dll")] static extern int JsDisposeRuntime(IntPtr runtime);
    [DllImport("Chakra.dll", CharSet = CharSet.Unicode)] static extern int JsRunScript(string script, UIntPtr id, string url, out IntPtr result);
    [DllImport("Chakra.dll")] static extern int JsGetGlobalObject(out IntPtr value);
    [DllImport("Chakra.dll", CharSet = CharSet.Unicode)] static extern int JsGetPropertyIdFromName(string name, out IntPtr id);
    [DllImport("Chakra.dll")] static extern int JsSetProperty(IntPtr value, IntPtr id, IntPtr property, [MarshalAs(UnmanagedType.I1)] bool strict);
    [DllImport("Chakra.dll")] static extern int JsCreateFunction(NativeFunction function, IntPtr state, out IntPtr value);
    [DllImport("Chakra.dll")] static extern int JsCallFunction(IntPtr function, IntPtr[] args, ushort count, out IntPtr result);
    [DllImport("Chakra.dll")] static extern int JsAddRef(IntPtr value, out uint count);
    [DllImport("Chakra.dll")] static extern int JsGetUndefinedValue(out IntPtr value);
    [DllImport("Chakra.dll")] static extern int JsNumberToDouble(IntPtr value, out double number);
    [DllImport("Chakra.dll")] static extern int JsDoubleToNumber(double number, out IntPtr value);
    [DllImport("Chakra.dll", CharSet = CharSet.Unicode)] static extern int JsPointerToString(string text, UIntPtr length, out IntPtr value);
    [DllImport("Chakra.dll")] static extern int JsStringToPointer(IntPtr value, out IntPtr text, out UIntPtr length);
    [DllImport("Chakra.dll")] static extern int JsGetAndClearException(out IntPtr value);
    [DllImport("Chakra.dll")] static extern int JsConvertValueToString(IntPtr value, out IntPtr text);
    [DllImport("Chakra.dll")] static extern int JsCreateError(IntPtr message, out IntPtr error);
    [DllImport("Chakra.dll")] static extern int JsSetException(IntPtr error);

    IntPtr runtime, undefined, entry;
    uint scriptId;
    readonly NativeFunction callback;
    readonly Func<Args, IntPtr> dispatch;

    public JsHost(Func<Args, IntPtr> dispatch)
    {
        this.dispatch = dispatch;
        callback = Dispatch;
        Check(JsCreateRuntime(0, IntPtr.Zero, out runtime));
        try
        {
            IntPtr context, global, id, function;
            Check(JsCreateContext(runtime, out context));
            Check(JsSetCurrentContext(context));
            Check(JsGetUndefinedValue(out undefined));
            Check(JsGetGlobalObject(out global));
            Check(JsGetPropertyIdFromName("native", out id));
            Check(JsCreateFunction(callback, IntPtr.Zero, out function));
            Check(JsSetProperty(global, id, function, true));
        }
        catch { Dispose(); throw; }
    }

    IntPtr Dispatch(IntPtr callee, bool construct, IntPtr values, ushort count, IntPtr state)
    {
        try
        {
            IntPtr result = dispatch(new Args(values, count - 1));
            return result == IntPtr.Zero ? undefined : result;
        }
        catch (Exception exception)
        {
            IntPtr error;
            if (JsCreateError(Str(exception.Message), out error) == 0) JsSetException(error);
            return undefined;
        }
    }

    public void Run(string script, string name)
    {
        IntPtr result;
        Execute(JsRunScript(script, new UIntPtr(++scriptId), name, out result), name);
    }

    public void Bind()
    {
        Execute(JsRunScript("desktop", new UIntPtr(++scriptId), "entry.js", out entry), "entry.js");
        uint count;
        Check(JsAddRef(entry, out count));
    }

    public IntPtr Call(string action, double x = 0, double y = 0)
    {
        IntPtr result;
        IntPtr[] args = { undefined, Str(action), Num(x), Num(y) };
        Execute(JsCallFunction(entry, args, (ushort)args.Length, out result), action);
        return result;
    }

    static void Check(int code)
    {
        if (code != 0) throw new InvalidOperationException("Chakra 0x" + code.ToString("X"));
    }

    static void Execute(int code, string source)
    {
        if (code == 0) return;
        IntPtr error, message;
        string detail = JsGetAndClearException(out error) == 0 && JsConvertValueToString(error, out message) == 0
            ? Text(message) : "Chakra 0x" + code.ToString("X");
        throw new InvalidOperationException(source + "\n" + detail);
    }

    public static IntPtr Num(double number) { IntPtr result; Check(JsDoubleToNumber(number, out result)); return result; }
    public static IntPtr Str(string text) { IntPtr result; Check(JsPointerToString(text, new UIntPtr((uint)text.Length), out result)); return result; }
    public static double Number(IntPtr value) { double result; Check(JsNumberToDouble(value, out result)); return result; }
    public static string Text(IntPtr value)
    {
        IntPtr text; UIntPtr length;
        Check(JsStringToPointer(value, out text, out length));
        return Marshal.PtrToStringUni(text, (int)length.ToUInt32());
    }

    public void Dispose()
    {
        if (runtime == IntPtr.Zero) return;
        JsSetCurrentContext(IntPtr.Zero);
        JsDisposeRuntime(runtime);
        runtime = IntPtr.Zero;
        GC.KeepAlive(callback);
    }

    public struct Args
    {
        readonly IntPtr values;
        public readonly int Count;
        public Args(IntPtr values, int count) { this.values = values; Count = count; }
        IntPtr At(int i) { return Marshal.ReadIntPtr(values, (i + 1) * IntPtr.Size); }
        public float N(int i) { return (float)Number(At(i)); }
        public int I(int i) { return (int)Number(At(i)); }
        public string S(int i) { return Text(At(i)); }
    }
}
