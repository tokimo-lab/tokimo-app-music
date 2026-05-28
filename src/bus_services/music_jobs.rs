use std::sync::Arc;

use serde_json::Value as JsonValue;
use tokimo_bus_client::BusClientBuilder;
use tokimo_bus_protocol::{BusError, HttpMethod, MethodDecl};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::ctx::AppCtx;

fn decl(name: &str, description: &str) -> MethodDecl {
    MethodDecl {
        name: name.into(),
        description: Some(description.into()),
        requires_auth: false,
        streaming: false,
        http_method: HttpMethod::Post,
        path: None,
    }
}

fn caller_user_id(caller: &tokimo_bus_protocol::CallerCtx) -> Option<Uuid> {
    caller
        .user_id
        .as_deref()
        .and_then(|s| Uuid::parse_str(s).ok())
}

fn decode_request(raw: &[u8]) -> Result<(Uuid, JsonValue), BusError> {
    let value: JsonValue = serde_json::from_slice(raw)
        .map_err(|e| BusError::BadRequest(format!("json decode: {e}")))?;
    let job = value
        .get("job")
        .ok_or_else(|| BusError::BadRequest("missing 'job' field".into()))?;
    let job_id = job
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| BusError::BadRequest("missing 'job.id'".into()))
        .and_then(|s| {
            Uuid::parse_str(s).map_err(|e| BusError::BadRequest(format!("job.id UUID: {e}")))
        })?;
    let params = job.get("params").cloned().unwrap_or(JsonValue::Null);
    Ok((job_id, params))
}

pub fn register(builder: BusClientBuilder, ctx: Arc<AppCtx>) -> BusClientBuilder {
    let ctx_scrape = Arc::clone(&ctx);

    builder
        .method(decl(
            "dispatch_music_scrape",
            "Run a music_scrape job on behalf of the main worker",
        ))
        .on_invoke("dispatch_music_scrape", move |req| {
            let ctx = Arc::clone(&ctx_scrape);
            async move {
                let (job_id, params) = decode_request(&req.payload)?;
                let user_id = caller_user_id(&req.caller);
                let cancel = CancellationToken::new();
                crate::queue::handlers::music_scrape::handle(
                    &ctx.db, job_id, &params, &cancel, user_id,
                )
                .await
                .map(|_| b"{}".to_vec())
                .map_err(|e| BusError::Internal(e.to_string()))
            }
        })
        .method(decl(
            "capabilities",
            "Return music bus service capabilities",
        ))
        .on_invoke("capabilities", |_req| async move {
            serde_json::to_vec(&serde_json::json!({
                "version": env!("CARGO_PKG_VERSION"),
                "methods": ["dispatch_music_scrape", "capabilities"],
            }))
            .map_err(|e| BusError::Internal(e.to_string()))
        })
}
