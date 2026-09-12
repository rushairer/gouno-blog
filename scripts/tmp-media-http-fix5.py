from pathlib import Path

path = Path(__file__).resolve().parents[1] / "blog-backend/internal/agent/approval.go"
text = path.read_text()
old_iface = '''type mediaLister interface {
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
}
'''
new_iface = '''type mediaAssetGateway interface {
	ListMedia(context.Context, domain.MediaFilter) ([]*domain.MediaAsset, error)
	CreateMedia(context.Context, *domain.MediaAsset) error
}
'''
if text.count(old_iface) != 1:
    raise SystemExit(f"expected one mediaLister interface, found {text.count(old_iface)}")
text = text.replace(old_iface, new_iface, 1)
old_field = "\tmediaAssets mediaLister\n"
if text.count(old_field) != 1:
    raise SystemExit(f"expected one mediaAssets field type, found {text.count(old_field)}")
text = text.replace(old_field, "\tmediaAssets mediaAssetGateway\n", 1)
old_param = "mediaAssets mediaLister, store media.Store"
if text.count(old_param) != 1:
    raise SystemExit(f"expected one mediaAssets constructor parameter, found {text.count(old_param)}")
text = text.replace(old_param, "mediaAssets mediaAssetGateway, store media.Store", 1)
path.write_text(text)
