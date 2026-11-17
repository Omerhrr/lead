"""Verify the email-provider hook: Resend error mapping + a real SMTP send loop.

Starts a minimal SMTP sink on 127.0.0.1:1025, then runs
scripts/test_provider.ts (bun) which first tries Resend with an invalid key
and then SMTP against the sink. Prints both outcomes and the SMTP conversation.
"""
import socket
import subprocess
import threading

lines = []


def sink():
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 1025))
    srv.listen(2)
    srv.settimeout(15)
    print("SMTP sink listening on 1025")
    try:
        c, _ = srv.accept()
        f = c.makefile("rb")
        c.sendall(b"220 sink ESMTP\r\n")
        while True:
            l = f.readline()
            if not l:
                break
            lines.append(l.decode(errors="replace").strip())
            cmd = l.strip().upper()
            if cmd.startswith(b"EHLO"):
                c.sendall(b"250-sink\r\n250 OK\r\n")
            elif cmd.startswith(b"MAIL") or cmd.startswith(b"RCPT"):
                c.sendall(b"250 OK\r\n")
            elif cmd.startswith(b"DATA"):
                c.sendall(b"354 go\r\n")
            elif cmd == b".":
                c.sendall(b"250 queued\r\n")
                break
            elif cmd.startswith(b"QUIT"):
                break
        c.close()
    except Exception as e:  # noqa: BLE001
        print("sink err:", e)


def main():
    t = threading.Thread(target=sink)
    t.start()
    import time

    time.sleep(0.3)
    r = subprocess.run(
        ["bun", "scripts/test_provider.ts"],
        capture_output=True,
        text=True,
        timeout=30,
        cwd="/home/z/my-project",
    )
    print(r.stdout[-1500:])
    if r.returncode != 0:
        print("STDERR:", r.stderr[-800:])
    t.join(timeout=15)
    print("--- SMTP conversation received ---")
    for l in lines:
        print(l[:120])


if __name__ == "__main__":
    main()
