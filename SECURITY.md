# Security Policy

## Supported Versions

We currently support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue. Instead, please email the maintainers directly or create a private security advisory on GitHub.

When reporting a vulnerability, please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)

We will respond to security reports within 48 hours and work with you to address the issue before making it public.

## Security Best Practices

### For Contributors

- Never commit secrets, API keys, or credentials to the repository
- Use environment variables for all sensitive configuration
- Review the `.gitignore` file to ensure sensitive files are excluded
- Use strong, randomly generated secrets for production deployments

### For Users

- Always use strong, unique secrets for `JWT_SECRET` in production
- Keep your API keys (Flickr, Mapbox) secure and rotate them regularly
- Use environment variables or secure secret management systems
- Never expose `.env` files or commit them to version control
- Regularly update dependencies to receive security patches

## Known Security Considerations

- **JWT Tokens**: Ensure `JWT_SECRET` is a strong, randomly generated string in production
- **API Keys**: Store all API keys in environment variables, never in code
- **Database Credentials**: Use strong passwords and restrict database access
- **Rate Limiting**: The backend implements rate limiting to prevent abuse

