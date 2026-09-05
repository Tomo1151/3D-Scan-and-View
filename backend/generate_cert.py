import os
import socket
import datetime
from pathlib import Path

def get_local_ips():
    ips = ["127.0.0.1", "localhost"]
    try:
        # Get host IP in local network
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        if local_ip not in ips:
            ips.append(local_ip)
    except Exception:
        pass
    return ips

def generate_self_signed_cert(cert_dir: str):
    """
    Generates a self-signed SSL/TLS certificate (cert.pem and key.pem)
    with Subject Alternative Names for localhost and local LAN IP addresses.
    """
    cert_path = os.path.join(cert_dir, "cert.pem")
    key_path = os.path.join(cert_dir, "key.pem")

    if os.path.isfile(cert_path) and os.path.isfile(key_path):
        return cert_path, key_path

    os.makedirs(cert_dir, exist_ok=True)
    print(f"[INFO] Generating self-signed SSL certificate in {cert_dir}...")

    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import ipaddress

        # Generate private key
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "JP"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "3D-Scan-and-View"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ])

        # SANs (Subject Alternative Names)
        alt_names = []
        for ip in get_local_ips():
            try:
                alt_names.append(x509.IPAddress(ipaddress.ip_address(ip)))
            except ValueError:
                alt_names.append(x509.DNSName(ip))

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.now(datetime.timezone.utc))
            .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
            .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
            .sign(key, hashes.SHA256())
        )

        # Write key
        with open(key_path, "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            ))

        # Write cert
        with open(cert_path, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        print(f"[SUCCESS] Generated SSL certificate: {cert_path}")
        return cert_path, key_path

    except Exception as e:
        print(f"[WARN] Failed to generate SSL certificate using cryptography: {e}")
        return None, None

if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent / "certs"
    generate_self_signed_cert(str(base))
