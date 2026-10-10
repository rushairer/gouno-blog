package service_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/rushairer/blog-backend/internal/page/domain"
	"github.com/rushairer/blog-backend/internal/page/repository"
	"github.com/rushairer/blog-backend/internal/page/service"
	"github.com/rushairer/blog-backend/internal/testsupport"
)

// Unlike transaction-scoped NOW(), the Page update token must advance on
// every product edit. Otherwise a stale Agent approval could match again.
func TestPageUpdateTimestampMonotonicAndApprovalCAS(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx := context.Background()
	repo := repository.NewPageRepository(db)
	svc := service.NewPageService(repo)
	p := &domain.Page{Title:"Original",Slug:fmt.Sprintf("page-token-%d",time.Now().UnixNano()),
		Content:"Body",Template:"default",Status:domain.PageStatusDraft}
	if err := svc.CreatePage(ctx,p); err != nil { t.Fatal(err) }
	defer repo.Delete(ctx,p.ID)

	before := p.UpdatedAt
	p.Title = "First editor"
	if err := svc.UpdatePage(ctx,p); err != nil { t.Fatal(err) }
	first := p.UpdatedAt
	if !first.After(before) { t.Fatalf("first update timestamp=%v did not advance beyond %v",first,before) }
	p.Content = "Second editor"
	if err := svc.UpdatePage(ctx,p); err != nil { t.Fatal(err) }
	if !p.UpdatedAt.After(first) { t.Fatalf("second update timestamp=%v did not advance beyond %v",p.UpdatedAt,first) }

	tx, err := db.BeginTx(ctx,nil)
	if err != nil { t.Fatal(err) }
	defer tx.Rollback()
	stale, err := svc.GetPageTx(ctx,tx,p.ID)
	if err != nil { t.Fatal(err) }
	stale.Title = "Stale review"
	if err := svc.UpdatePageTx(ctx,tx,stale,before); !errors.Is(err,service.ErrPageApprovalConflict) {
		t.Fatalf("stale Page update result=%v, want conflict",err)
	}
	if err := tx.Rollback(); err != nil { t.Fatal(err) }
	latest, err := svc.GetPage(ctx,p.ID)
	if err != nil { t.Fatal(err) }
	if latest.Title!="First editor" || latest.Content!="Second editor" {
		t.Fatalf("normal Page edits overwritten by stale reviewer: %#v", latest)
	}
}

func TestPageTransactionalSlugValidationAndDuplicateProtection(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	ctx:=context.Background()
	repo:=repository.NewPageRepository(db)
	svc:=service.NewPageService(repo)
	slug:=fmt.Sprintf("page-dedup-%d",time.Now().UnixNano())
	first:=&domain.Page{Title:"First",Slug:" /"+slug+"/ ",Status:domain.PageStatusDraft}
	if err:=svc.CreatePage(ctx,first); err!=nil { t.Fatal(err) }
	defer repo.Delete(ctx,first.ID)
	if first.Slug!=slug { t.Fatalf("normalized slug=%q expected=%q",first.Slug,slug) }

	for _,test:=range []struct{name,slug string;want error}{
		{"duplicate",slug,service.ErrDuplicateSlug},
		{"reserved","/ADMIN/",service.ErrReservedSlug},
		{"bad charset","INVALID_SLUG",service.ErrInvalidSlug},
	}{
		t.Run(test.name,func(t *testing.T){
			tx,err:=db.BeginTx(ctx,nil)
			if err!=nil { t.Fatal(err) }
			defer tx.Rollback()
			candidate:=&domain.Page{Title:"Candidate",Slug:test.slug}
			if err:=svc.CreatePageTx(ctx,tx,candidate); !errors.Is(err,test.want){
				t.Fatalf("CreatePageTx slug=%q err=%v want=%v",test.slug,err,test.want)
			}
		})
	}
	var count int
	if err:=db.QueryRowContext(ctx,`SELECT COUNT(*) FROM pages WHERE slug=$1`,slug).Scan(&count);err!=nil{t.Fatal(err)}
	if count!=1 {t.Fatalf("Page Slug duplication count=%d",count)}

	// A concurrent insert can still win after the preliminary Slug lookup.
	// The actual UNIQUE constraint error is converted to a Page domain error.
	tx,err:=db.BeginTx(ctx,nil)
	if err!=nil {t.Fatal(err)}
	defer tx.Rollback()
	newSlug:=fmt.Sprintf("page-race-%d",time.Now().UnixNano())
	if _,err:=db.ExecContext(ctx,`INSERT INTO pages (title,slug,content,summary,template,status,allow_comments,show_in_nav,sort_order,seo_title,seo_description)
		VALUES('Other editor',$1,'','','default','draft',FALSE,FALSE,0,'','')`,newSlug);err!=nil {t.Fatal(err)}
	defer db.ExecContext(ctx,`DELETE FROM pages WHERE slug=$1`,newSlug)
	conflict:=&domain.Page{Title:"Retry",Slug:newSlug}
	if err:=svc.CreatePageTx(ctx,tx,conflict);!errors.Is(err,service.ErrDuplicateSlug){
		t.Fatalf("concurrent duplicate creation=%v, want ErrDuplicateSlug",err)
	}
	if err:=tx.Rollback();err!=nil{t.Fatal(err)}
}

func TestPageRejectsNilApprovalTransactions(t *testing.T) {
	db := testsupport.OpenTestDB(t)
	defer db.Close()
	svc:=service.NewPageService(repository.NewPageRepository(db))
	if err:=svc.CreatePageTx(context.Background(),(*sql.Tx)(nil),&domain.Page{Title:"no tx"});err==nil{
		t.Fatal("nil transaction allowed creation")
	}
	if err:=svc.UpdatePageTx(context.Background(),(*sql.Tx)(nil),&domain.Page{ID:1},time.Now());err==nil{
		t.Fatal("nil transaction allowed update")
	}
}
