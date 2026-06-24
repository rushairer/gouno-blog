---
name: gouno_blog_manager
description: Instructions and guidelines for AI agents to programmatically query, create, update, and manage articles and comments on Gouno Blog.
---

# Gouno Blog Manager Skill

This skill guides you (the AI agent) on how to programmatically manage Gouno Blog. It covers OIDC authentication, API endpoints, and direct database queries.

---

## 🔑 OIDC Authentication Flow

Before calling administrative endpoints (e.g. creating, updating, or deleting posts), you must obtain an OIDC access token (JWT) from GOSSO.

### 1. Direct OIDC Login Request
To authenticate programmatically, make a `POST` request to the GOSSO login endpoint on the unified gateway:
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```
- **Default Seeded Admin Credentials**: `admin` / `admin123`.
- **Response Shape**:
  ```json
  {
    "code": 200,
    "message": "success",
    "data": {
      "access_token": "ey...",
      "refresh_token": "ey...",
      "token_type": "Bearer",
      "expires_in": 900
    }
  }
  ```

### 2. Attaching the Token
For all admin requests, attach the returned `access_token` in the HTTP headers:
```http
Authorization: Bearer <your_access_token_here>
```

---

## 📡 API Endpoints Summary

All API endpoints are prefixed with `/api` and exposed via the gateway (`http://localhost:8080/api`).

### 1. Posts Management
* **List Posts** (Public): `GET /posts?tag={tag}&page={page}&pageSize={size}`
* **Retrieve Post** (Public): `GET /posts/{id_or_slug}`
* **List Tags** (Public): `GET /tags`
* **Create Post** (Admin): `POST /posts`
  - Body:
    ```json
    {
      "title": "Post Title",
      "slug": "post-slug",
      "summary": "Short summary",
      "content": "Full markdown content here",
      "tags": ["Tag1", "Tag2"]
    }
    ```
* **Update Post** (Admin): `PUT /posts/{id}`
  - Body: Same schema as Create.
* **Delete Post** (Admin): `DELETE /posts/{id}`

### 2. Comments Management
* **List Comments** (Public): `GET /posts/{post_id_or_slug}/comments`
* **Create Comment** (Public): `POST /posts/{post_id}/comments`
  - Body: `{"author": "Name", "content": "Text"}`
* **Delete Comment** (Admin): `DELETE /comments/{id}`

---

## 🗄️ Database Schemas (PostgreSQL)

If you have database access, you can run SQL queries directly on the PostgreSQL database (`sso-blog-db` on port `5432`).

### 1. Blog Backend Database (`dbname=blog`)
* **`posts`** table:
  - `id` (SERIAL PRIMARY KEY)
  - `title` (VARCHAR(255) NOT NULL)
  - `slug` (VARCHAR(255) UNIQUE NOT NULL)
  - `summary` (TEXT)
  - `content` (TEXT)
  - `tags` (TEXT[] NOT NULL DEFAULT '{}')
  - `created_at` (TIMESTAMPTZ)
  - `updated_at` (TIMESTAMPTZ)
* **`comments`** table:
  - `id` (SERIAL PRIMARY KEY)
  - `post_id` (INT NOT NULL, references `posts.id` on delete cascade)
  - `author` (VARCHAR(100) NOT NULL)
  - `content` (TEXT NOT NULL)
  - `created_at` (TIMESTAMPTZ)

### 2. GOSSO Identity Provider Database (`dbname=gosso`)
* **`accounts`** table:
  - `id` (UUID PRIMARY KEY)
  - `username` (VARCHAR(255) UNIQUE)
  - `display_name` (VARCHAR(255))
  - `status` (VARCHAR(50))
* **`roles`** table:
  - `id` (UUID PRIMARY KEY)
  - `name` (VARCHAR(100) UNIQUE)
* **`account_roles`** table:
  - `account_id` (UUID, references `accounts.id`)
  - `role_id` (UUID, references `roles.id`)
* **`oauth2_clients`** table:
  - `client_id` (VARCHAR(255) UNIQUE) - e.g. `blog-spa`

---

## 🤖 AI Guidelines for Automated Management

1. **Structured Content Generation**: When writing posts, ensure you output valid markdown. Always assign tags relevant to the article context.
2. **Comment Moderation**:
   - Select comment lists via `GET /posts/{post_id_or_slug}/comments`.
   - Scan for spam/toxicity using natural language classification.
   - Delete offending comments via `DELETE /comments/{id}` using the admin auth header.
3. **Database Health Verification**:
   - Verify DB connectivity by querying the table structures or checking if the seed records exist.
