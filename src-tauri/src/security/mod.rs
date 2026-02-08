use axum::extract::Request;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

const API_KEY_HEADER: &str = "x-api-key";

pub async fn api_key_middleware(req: Request, next: Next) -> Response {
    let authorized = req
        .headers()
        .get(API_KEY_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if !authorized {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    }

    next.run(req).await
}
