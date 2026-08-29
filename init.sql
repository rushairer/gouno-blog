-- Local cluster databases. Application code still talks to Gosso only through OIDC/JWKS.
SELECT 'CREATE DATABASE gosso' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gosso')\gexec
SELECT 'CREATE DATABASE blog' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'blog')\gexec
