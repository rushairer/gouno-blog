package domain

import (
	"errors"
	"strconv"
)

var ErrRevisionConflict = errors.New("文章已被修改，请保留草稿并重新加载最新版本")
var ErrExpectedRevision = errors.New("expected_revision 必须为正整数，请重新加载文章")

func RevisionToken(revision int64) string { return "revision:" + strconv.FormatInt(revision, 10) }
