package cid

import (
	ipfscid "github.com/ipfs/go-cid"
	"go.k6.io/k6/js/modules"
)

// init is called by the Go runtime at application startup.
func init() {
	modules.Register("k6/x/cid", new(Cid))
}

// Compare is the type for our custom API.
type Cid struct {
}

// IsGreater returns true if a is greater than b, or false otherwise, setting textual result message.
func (c *Cid) Hash(cid string) string {
	parsedCid, _ := ipfscid.Parse(cid)
	return parsedCid.Hash().B58String()
}
