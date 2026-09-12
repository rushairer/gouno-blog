from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

approval = ROOT / "blog-backend/internal/agent/approval.go"
text = approval.read_text()
old_iface = '''type mediaAssetGateway interface {
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
	CreateMedia(context.Context, *domain.MediaAsset) error
}
'''
new_iface = '''type mediaAssetGateway interface {
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
	CreateMedia(context.Context, *domain.MediaAsset) error
	DeleteMedia(context.Context, int64) (*domain.MediaAsset, error)
}
'''
if text.count(old_iface) != 1:
    raise SystemExit(f"approval.go: expected one mediaAssetGateway, found {text.count(old_iface)}")
text = text.replace(old_iface, new_iface, 1)
old_call = "_, _ = s.growth.DeleteMedia(ctx, asset.ID)"
if text.count(old_call) != 1:
    raise SystemExit(f"approval.go: expected one Growth DeleteMedia call, found {text.count(old_call)}")
text = text.replace(old_call, "_, _ = s.mediaAssets.DeleteMedia(ctx, asset.ID)", 1)
approval.write_text(text)

compat_test = ROOT / "blog-backend/internal/service/growth_service_media_compat_test.go"
if not compat_test.exists():
    raise SystemExit("missing expected Growth Media compatibility test")
compat_test.unlink()
