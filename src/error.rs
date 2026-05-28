use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    BadRequest(String),
    Conflict(String),
    Internal(String),
    Database(sea_orm::DbErr),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound(msg) => write!(f, "not found: {msg}"),
            Self::BadRequest(msg) => write!(f, "bad request: {msg}"),
            Self::Conflict(msg) => write!(f, "conflict: {msg}"),
            Self::Internal(msg) => write!(f, "internal: {msg}"),
            Self::Database(err) => write!(f, "database: {err}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<sea_orm::DbErr> for AppError {
    fn from(err: sea_orm::DbErr) -> Self {
        Self::Database(err)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Internal(_) | Self::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        let body = serde_json::json!({
            "success": false,
            "error": self.to_string(),
        });
        (status, Json(body)).into_response()
    }
}

pub trait OptionExt<T> {
    fn not_found(self, msg: String) -> Result<T, AppError>;
    fn internal(self, msg: &str) -> Result<T, AppError>;
}

impl<T> OptionExt<T> for Option<T> {
    fn not_found(self, msg: String) -> Result<T, AppError> {
        self.ok_or_else(|| AppError::NotFound(msg))
    }

    fn internal(self, msg: &str) -> Result<T, AppError> {
        self.ok_or_else(|| AppError::Internal(msg.to_string()))
    }
}
