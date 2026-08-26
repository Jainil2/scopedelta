use regex::Regex;
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkTarget {
    pub server: String,
    pub path: String,
}

fn is_loopback(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1"
}

pub fn normalize_origin(value: &str, debug: bool) -> Result<String, String> {
    let mut url =
        Url::parse(value.trim()).map_err(|_| "Enter a valid server origin.".to_string())?;
    if url.cannot_be_a_base()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err("Use a server origin without a path, credentials, query, or fragment.".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "The server origin must include a host.".to_string())?;
    let transport_allowed =
        url.scheme() == "https" || (debug && url.scheme() == "http" && is_loopback(host));
    if !transport_allowed {
        return Err(if debug {
            "HTTPS is required except for loopback development servers."
        } else {
            "HTTPS is required."
        }
        .into());
    }
    url.set_path("");
    Ok(url.origin().ascii_serialization())
}

pub fn validate_route(path: &str) -> Result<String, String> {
    if path.len() > 512
        || !path.starts_with('/')
        || path.contains(['?', '#', '\\', '%'])
        || path.split('/').any(|segment| matches!(segment, "." | ".."))
    {
        return Err("The desktop link route is not allowed.".into());
    }

    let slug = r"[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?";
    let key = r"[A-Z0-9](?:[A-Z0-9-]{0,31}[A-Z0-9])?";
    let uuid = r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
    let pattern = format!(
        r"^(?:/app/{slug}(?:/inbox|/projects(?:/{key}(?:/(?:brief|client)|/work/{uuid})?)?)?|/client(?:/notifications|/projects/{uuid})?)$"
    );
    if !Regex::new(&pattern)
        .expect("desktop route expression must compile")
        .is_match(path)
    {
        return Err("The desktop link route is not allowed.".into());
    }
    Ok(path.to_string())
}

pub fn parse_deep_link(value: &str, debug: bool) -> Result<DeepLinkTarget, String> {
    if value.contains('#') {
        return Err("Desktop links cannot contain fragments.".into());
    }
    let url = Url::parse(value).map_err(|_| "The desktop link is invalid.".to_string())?;
    if url.scheme() != "scopedelta"
        || url.host_str() != Some("open")
        || url.path() != ""
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("The desktop link is invalid.".into());
    }
    let raw_pairs = url
        .query()
        .unwrap_or_default()
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .collect::<Vec<_>>();
    if raw_pairs.len() != 2
        || raw_pairs.iter().filter(|(key, _)| *key == "server").count() != 1
        || raw_pairs.iter().filter(|(key, _)| *key == "path").count() != 1
    {
        return Err("The desktop link must contain one server and one path.".into());
    }
    let raw_path = raw_pairs
        .iter()
        .find(|(key, _)| *key == "path")
        .map(|(_, value)| value.to_ascii_lowercase())
        .ok_or_else(|| "The desktop link has no path.".to_string())?;
    if raw_path.contains("%2f") || raw_path.contains("%5c") {
        return Err("Encoded route separators are not allowed.".into());
    }
    let pairs = url.query_pairs().collect::<Vec<_>>();
    if pairs.len() != 2
        || pairs.iter().filter(|(key, _)| key == "server").count() != 1
        || pairs.iter().filter(|(key, _)| key == "path").count() != 1
    {
        return Err("The desktop link must contain one server and one path.".into());
    }
    let server = pairs
        .iter()
        .find(|(key, _)| key == "server")
        .map(|(_, value)| value.as_ref())
        .ok_or_else(|| "The desktop link has no server.".to_string())?;
    let path = pairs
        .iter()
        .find(|(key, _)| key == "path")
        .map(|(_, value)| value.as_ref())
        .ok_or_else(|| "The desktop link has no path.".to_string())?;
    Ok(DeepLinkTarget {
        server: normalize_origin(server, debug)?,
        path: validate_route(path)?,
    })
}

pub fn same_origin(url: &Url, origin: &str) -> bool {
    url.origin().ascii_serialization() == origin
}

pub fn allowed_provider_url(url: &Url) -> bool {
    url.scheme() == "https"
        && matches!(
            url.host_str(),
            Some("github.com")
                | Some("www.github.com")
                | Some("paddle.com")
                | Some("www.paddle.com")
                | Some("checkout.paddle.com")
                | Some("pay.paddle.io")
                | Some("sandbox.pay.paddle.io")
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_production_origins() {
        assert_eq!(
            normalize_origin("https://Example.com:443/", false).unwrap(),
            "https://example.com"
        );
        for rejected in [
            "http://example.com",
            "https://user@example.com",
            "https://example.com/path",
            "https://example.com?next=/app",
            "https://example.com/#fragment",
        ] {
            assert!(normalize_origin(rejected, false).is_err(), "{rejected}");
        }
    }

    #[test]
    fn permits_loopback_http_only_in_debug() {
        for origin in ["http://localhost:3000", "http://127.0.0.1:3000"] {
            assert!(normalize_origin(origin, true).is_ok(), "{origin}");
            assert!(normalize_origin(origin, false).is_err(), "{origin}");
        }
        assert!(normalize_origin("http://[::1]:3000", true).is_err());
        assert!(normalize_origin("http://127.0.0.2:3000", true).is_err());
        assert!(normalize_origin("http://localhost.example.com", true).is_err());
    }

    #[test]
    fn accepts_only_enumerated_product_routes() {
        for path in [
            "/app/acme",
            "/app/acme/inbox",
            "/app/acme/projects",
            "/app/acme/projects/DELTA/brief",
            "/app/acme/projects/DELTA/client",
            "/app/acme/projects/DELTA/work/11111111-1111-4111-8111-111111111111",
            "/client",
            "/client/notifications",
            "/client/projects/11111111-1111-4111-8111-111111111111",
        ] {
            assert_eq!(validate_route(path).unwrap(), path);
        }
        for path in [
            "https://evil.example",
            "/api/v1/workspaces",
            "/app/acme/settings",
            "/app/acme/../admin",
            "/app/acme%2finbox",
            "/client/projects/not-a-uuid",
            "/app/acme/inbox#secret",
        ] {
            assert!(validate_route(path).is_err(), "{path}");
        }
    }

    #[test]
    fn validates_deep_link_shape_and_deployment() {
        let link = parse_deep_link(
            "scopedelta://open?server=https%3A%2F%2Fapp.example.com&path=/app/acme/inbox",
            false,
        )
        .unwrap();
        assert_eq!(link.server, "https://app.example.com");
        assert_eq!(link.path, "/app/acme/inbox");

        for invalid in [
            "scopedelta://open?server=https%3A%2F%2Fapp.example.com&path=https%3A%2F%2Fevil.example",
            "scopedelta://open?server=http%3A%2F%2Fapp.example.com&path=%2Fclient",
            "scopedelta://open?server=https%3A%2F%2Fapp.example.com&path=/client#fragment",
            "scopedelta://open?server=https%3A%2F%2Fapp.example.com&server=https%3A%2F%2Fevil.example&path=/client",
            "scopedelta://open?server=https%3A%2F%2Fapp.example.com&path=/app/acme%2finbox",
        ] {
            assert!(parse_deep_link(invalid, false).is_err(), "{invalid}");
        }
    }

    #[test]
    fn external_provider_allowlist_is_exact_and_https_only() {
        for allowed in [
            "https://github.com/scopedelta/app",
            "https://checkout.paddle.com/pay/123",
            "https://sandbox.pay.paddle.io/checkout/123",
        ] {
            assert!(
                allowed_provider_url(&Url::parse(allowed).unwrap()),
                "{allowed}"
            );
        }
        for blocked in [
            "http://github.com/scopedelta/app",
            "https://github.com.evil.example/scopedelta/app",
            "https://example.com/checkout",
            "file:///tmp/customer-data",
        ] {
            assert!(
                !allowed_provider_url(&Url::parse(blocked).unwrap()),
                "{blocked}"
            );
        }
    }
}
