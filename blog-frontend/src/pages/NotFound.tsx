import { BookOpen, FileText, FolderTree, Home, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n';
import { usePageTitle } from '../hooks/usePageTitle';

export default function NotFound() {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const isZh = locale === 'zh';
  usePageTitle(isZh ? '404 页面未找到' : '404 Not Found');

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = new FormData(event.currentTarget).get('q');
    if (query && String(query).trim()) {
      navigate(`/search?q=${encodeURIComponent(String(query).trim())}`);
    }
  };

  return (
    <div className="public-container not-found-page">
      <div className="not-found-card">
        <div className="not-found-badge">
          <span className="not-found-code">404</span>
          <span className="not-found-badge__dot">/</span>
          <span className="not-found-badge__label">
            {isZh ? '页面未找到' : 'Page Not Found'}
          </span>
        </div>

        <h1 className="not-found-title">
          {isZh ? '你寻找的页面不存在' : 'The page you are looking for does not exist'}
        </h1>
        <p className="not-found-subtitle">
          {isZh
            ? '这条路径可能已被移动、重命名，或者从未发布过文章。您可以尝试搜索，或通过下方导航继续探索。'
            : 'This path may have been moved, renamed, or never published. Try searching or explore via the links below.'}
        </p>

        <form className="not-found-search" onSubmit={handleSearch}>
          <Search className="not-found-search__icon" />
          <input
            name="q"
            type="search"
            aria-label={isZh ? '搜索文章' : 'Search posts'}
            placeholder={isZh ? '搜索文章或主题关键词…' : 'Search articles or topics…'}
            autoComplete="off"
          />
          <button type="submit" className="not-found-search__btn">
            {isZh ? '搜索' : 'Search'}
          </button>
        </form>

        <div className="not-found-nav">
          <span className="not-found-nav__label">
            {isZh ? '您可以尝试访问以下入口：' : 'You can try visiting:'}
          </span>
          <div className="not-found-nav__links">
            <Link to="/" className="not-found-nav__item">
              <Home />
              <span>{isZh ? '回到首页' : 'Home'}</span>
            </Link>
            <Link to="/articles" className="not-found-nav__item">
              <BookOpen />
              <span>{isZh ? '全部文章' : 'All Articles'}</span>
            </Link>
            <Link to="/categories" className="not-found-nav__item">
              <FolderTree />
              <span>{isZh ? '内容分类' : 'Categories'}</span>
            </Link>
            <Link to="/archive" className="not-found-nav__item">
              <FileText />
              <span>{isZh ? '全站归档' : 'Archive'}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
