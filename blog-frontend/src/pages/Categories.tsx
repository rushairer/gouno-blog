import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState } from '../components/ui';
import { siteApi } from '../api/site';
import { usePageTitle } from '../hooks/usePageTitle';
import type { Category } from '../types/blog';

export default function Categories() {
  usePageTitle('分类');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    siteApi.getCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="public-container simple-page taxonomy-page">
      <header>
        <p>CATEGORIES / FIELDS</p>
        <h1>分类</h1>
        <span>围绕长期问题建立内容脉络。</span>
      </header>
      <div className="simple-page__body">
        {loading ? (
          <LoadingState label="正在整理分类索引…" />
        ) : categories.length ? (
          <div className="category-grid">
            {categories.map((item, index) => (
              <Link to={`/categories/${item.slug}`} key={item.id}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h2>{item.name}</h2>
                <p>{item.description || '查看这个主题下的全部文章与实践记录。'}</p>
                <div>{item.post_count || 0} 篇文章 <ArrowRight /></div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState label="分类模型已经就绪，创建第一个分类后会在这里出现。" />
        )}
      </div>
    </div>
  );
}
