import AvailabilityCalendar from "./AvailabilityCalendar";
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { getProposalBySlug, getYachtsByIds, getBookingsByYachtIds, trackEvent, addToShortlist, removeFromShortlist, getShortlist, submitEnquiry, submitCharterEnquiry } from "../lib/supabase";

// ── Logo Assets (base64 embedded) ──
// NOTE: Paste your existing LOGO_WHITE base64 string here (keep it identical to your original file)
const LOGO_WHITE = "__PASTE_YOUR_EXISTING_LOGO_WHITE_BASE64_HERE__";
// NOTE: Paste your existing LOGO_NAVY base64 string here (keep it identical to your original file)
const LOGO_NAVY = "__PASTE_YOUR_EXISTING_LOGO_NAVY_BASE64_HERE__";
// NOTE: Paste your existing JOSH_PHOTO base64 string here (keep it identical to your original file)
const JOSH_PHOTO = "__PASTE_YOUR_EXISTING_JOSH_PHOTO_BASE64_HERE__";

// ── Brand Constants ──
const NAVY = "#0f1d2f";
const NAVY_LIGHT = "#1a2d45";
const NAVY_MID = "#152538";
const RED_ACCENT = "#c43a2b";
const CREAM = "#f7f5f0";
const GOLD = "#c9a96e";
const WHITE = "#ffffff";

// ── Yachtfolio API ──
const YF_PROXY = "/api/yachtfolio";


const BROKER = {
  name: "Josh Cripps",
  email: "josh.cripps@roccabellayachts.com",
  phone: "+34 603 74 77 41",
  website: "roccabellayachts.com",
  instagram: "@roccabella_yachts",
  bio: "Josh's maritime journey began at just six years old, and by 20, he launched his professional yachting career. Over the years, Josh has worked on some of the world's most prestigious yachts, ranging from 30 to 100 meters. With over 12 years of experience and 150+ charters since 2022, Josh has honed his expertise across the luxury yachting industry — from managing a fleet of 15 charter vessels to chartering out some of the world's most luxurious vessels to clients worldwide.",
};

// ── Utility ──
const formatPrice = (price, discount = 0) => {
  if (price === "TBC" || !price) return "POA";
  const val = typeof price === "string" ? parseInt(price) : price;
  if (isNaN(val)) return "POA";
  const discounted = discount > 0 ? Math.round(val * (1 - discount / 100)) : val;
  return `€${discounted.toLocaleString()}`;
};

const ftFromM = (m) => {
  const metres = parseFloat(m);
  return `${Math.round(metres * 3.28084)}'`;
};

// ── Loading Screen ──
function LoadingScreen({ onComplete, brokerFriendly, clientName, partnerLogoUrl }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      p += Math.random() * 3 + 1;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setTimeout(onComplete, 600);
      }
      setProgress(p);
      if (p > 33 && p < 66) setPhase(1);
      else if (p >= 66) setPhase(2);
    }, 60);
    return () => clearInterval(interval);
  }, [onComplete]);

  const phrases = [
    "Preparing your private selection",
    "Curating yacht details",
    "Finalising your proposal",
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: NAVY, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      zIndex: 9999, fontFamily: "'Cormorant Garamond', serif",
    }}>
      {/* Logo */}
      {!brokerFriendly ? (
        <img
          src={partnerLogoUrl || LOGO_WHITE}
          alt={partnerLogoUrl ? "Partner" : "Roccabella Yachts"}
          onError={(e) => { e.currentTarget.src = LOGO_WHITE; }}
          style={{
            height: 50, marginBottom: 40, opacity: progress > 5 ? 1 : 0,
            transition: "opacity 1s ease", display: "block", margin: "0 auto 40px",
            objectFit: "contain", maxWidth: 240,
          }}
        />
      ) : (
        <div style={{
          fontSize: 12, letterSpacing: 4, color: "rgba(255,255,255,0.4)",
          fontFamily: "'Inter', sans-serif", fontWeight: 300, marginBottom: 40,
          textTransform: "uppercase", opacity: progress > 5 ? 1 : 0,
          transition: "opacity 1s ease",
        }}>Charter Yacht Selection</div>
      )}

      {/* Progress line */}
      <div style={{
        width: 280, height: 1, background: "rgba(255,255,255,0.1)",
        borderRadius: 1, overflow: "hidden", marginBottom: 24,
      }}>
        <div style={{
          width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${RED_ACCENT}, ${GOLD})`,
          transition: "width 0.3s ease-out", borderRadius: 1,
        }} />
      </div>

      {/* Phase text */}
      <div style={{
        fontSize: 13, color: "rgba(255,255,255,0.4)", letterSpacing: 3,
        fontFamily: "'Inter', sans-serif", fontWeight: 300, textTransform: "uppercase",
        transition: "opacity 0.5s ease",
      }}>
        {phrases[phase]}
      </div>

      {/* Client name */}
      {!brokerFriendly && (
        <div style={{
          position: "absolute", bottom: 60, fontSize: 13,
          color: "rgba(255,255,255,0.2)", letterSpacing: 2,
          fontFamily: "'Inter', sans-serif", fontWeight: 300,
        }}>
          Prepared exclusively for {clientName}
        </div>
      )}
    </div>
  );
}

// ── Entry Gate ──
function EntryGate({ onEnter, brokerFriendly, clientName, partnerLogoUrl }) {
  const [name, setName] = useState("");
  const [hovering, setHovering] = useState(false);

  return (
    <div style={{
      position: "fixed", inset: 0, background: NAVY,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Cormorant Garamond', serif",
    }}>
      {!brokerFriendly && (
        <img
          src={partnerLogoUrl || LOGO_WHITE}
          alt={partnerLogoUrl ? "Partner" : "Roccabella Yachts"}
          onError={(e) => { e.currentTarget.src = LOGO_WHITE; }}
          style={{
            height: 46, marginBottom: 50, display: "block", margin: "0 auto 50px",
            objectFit: "contain", maxWidth: 240,
          }}
        />
      )}
      {brokerFriendly && (
        <div style={{
          fontSize: 12, letterSpacing: 4, color: "rgba(255,255,255,0.4)",
          fontFamily: "'Inter', sans-serif", fontWeight: 300, marginBottom: 50,
          textTransform: "uppercase",
        }}>Charter Yacht Selection</div>
      )}

      {!brokerFriendly && (
        <>
          <div style={{
            fontSize: 15, color: "rgba(255,255,255,0.5)", marginBottom: 8,
            fontFamily: "'Inter', sans-serif", fontWeight: 300, letterSpacing: 1,
          }}>
            This proposal was prepared for
          </div>
          <div style={{
            fontSize: 26, color: WHITE, marginBottom: 40, fontWeight: 400,
          }}>
            {clientName}
          </div>
        </>
      )}

      <div style={{
        fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 12,
        fontFamily: "'Inter', sans-serif", fontWeight: 300, letterSpacing: 1,
      }}>
        Please enter your name to view
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onEnter(name.trim())}
        placeholder="Your name"
        style={{
          width: 280, padding: "14px 20px", background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 0,
          color: WHITE, fontSize: 15, fontFamily: "'Inter', sans-serif",
          fontWeight: 300, outline: "none", textAlign: "center",
          letterSpacing: 1, marginBottom: 20,
        }}
      />

      <button
        onClick={() => name.trim() && onEnter(name.trim())}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        disabled={!name.trim()}
        style={{
          padding: "14px 48px", background: name.trim() ? RED_ACCENT : "rgba(255,255,255,0.05)",
          border: "none", color: WHITE, fontSize: 12, letterSpacing: 3,
          fontFamily: "'Inter', sans-serif", fontWeight: 400, cursor: name.trim() ? "pointer" : "default",
          textTransform: "uppercase", transition: "all 0.3s ease",
          opacity: name.trim() ? (hovering ? 0.9 : 1) : 0.3,
          transform: hovering && name.trim() ? "translateY(-1px)" : "none",
        }}
      >
        View Proposal
      </button>
    </div>
  );
}

// ── Yacht Card ──
function YachtCard({ yacht, discount, isFav, onToggleFav, onSelect, imageUrl }) {
  const [hovered, setHovered] = useState(false);
  const priceHigh = formatPrice(yacht.price_high, discount);
  const priceLow = formatPrice(yacht.price_low, discount);
  const hasDiscount = discount > 0 && yacht.price_high !== "TBC" && typeof yacht.price_high === "number";
  const hasImage = !!imageUrl;

  return (
    <div
      onClick={() => onSelect(yacht)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: "pointer", background: WHITE,
        borderRadius: 14, overflow: "hidden",
        transition: "all 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        transform: hovered ? "translateY(-6px) scale(1.01)" : "none",
        boxShadow: hovered
          ? "0 24px 64px rgba(15,29,47,0.18), 0 4px 12px rgba(15,29,47,0.08)"
          : "0 4px 24px rgba(15,29,47,0.07), 0 1px 4px rgba(15,29,47,0.04)",
      }}
    >
      {/* Image */}
      <div style={{
        height: 240,
        background: hasImage
          ? `url(${imageUrl}) center/cover`
          : `linear-gradient(145deg, ${NAVY} 0%, ${NAVY_LIGHT} 45%, #1e3a5f 100%)`,
        position: "relative", overflow: "hidden",
      }}>
        {!hasImage && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 12,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              border: "1.5px solid rgba(201,169,110,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ fontSize: 22, color: "rgba(201,169,110,0.45)" }}>⚓</div>
            </div>
            <div style={{
              fontSize: 9, color: "rgba(201,169,110,0.4)", letterSpacing: 3,
              fontFamily: "'Inter', sans-serif", textTransform: "uppercase", fontWeight: 400,
            }}>{yacht.name}</div>
          </div>
        )}
        <div style={{
          position: "absolute", inset: 0,
          background: hovered ? "rgba(15,29,47,0.15)" : "rgba(15,29,47,0.05)",
          transition: "background 0.4s ease",
        }} />

        {/* Favourite button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(yacht.id); }}
          style={{
            position: "absolute", top: 14, right: 14, width: 36, height: 36,
            borderRadius: "50%", border: "none",
            background: isFav ? RED_ACCENT : "rgba(255,255,255,0.85)",
            color: isFav ? WHITE : NAVY,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, transition: "all 0.3s ease",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {isFav ? "♥" : "♡"}
        </button>

        {/* Discount badge */}
        {hasDiscount && (
          <div style={{
            position: "absolute", top: 14, left: 14, padding: "5px 14px",
            background: RED_ACCENT, color: WHITE, fontSize: 10,
            fontFamily: "'Inter', sans-serif", fontWeight: 600, letterSpacing: 1.5,
            borderRadius: 6, textTransform: "uppercase",
          }}>
            {discount}% OFF
          </div>
        )}

        {/* Name overlay */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "40px 22px 18px",
          background: "linear-gradient(transparent, rgba(15,29,47,0.92))",
        }}>
          <div style={{
            fontSize: 24, color: WHITE, fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 500, letterSpacing: 2.5,
          }}>
            {yacht.name}
          </div>
        </div>
      </div>

      {/* Details */}
      <div style={{ padding: "22px 22px 26px" }}>
        <div style={{
          display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap",
        }}>
          {[
            { label: "Length", value: `${yacht.length_m}m / ${ftFromM(yacht.length_m)}` },
            { label: "Builder", value: yacht.builder },
            { label: "Year", value: yacht.year_refit ? `${yacht.year_built} / ${yacht.year_refit}` : yacht.year_built },
          ].map((item, i) => (
            <div key={i} style={{ minWidth: 80 }}>
              <div style={{
                fontSize: 10, color: "#999", fontFamily: "'Inter', sans-serif",
                fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3,
              }}>{item.label}</div>
              <div style={{
                fontSize: 14, color: NAVY, fontFamily: "'Inter', sans-serif", fontWeight: 500,
              }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{
          display: "flex", gap: 16, marginBottom: 16,
        }}>
          {[
            { label: "Cabins", value: yacht.cabins },
            { label: "Guests", value: yacht.guests },
            { label: "Crew", value: yacht.crew },
          ].map((item, i) => (
            <div key={i} style={{ minWidth: 60 }}>
              <div style={{
                fontSize: 10, color: "#999", fontFamily: "'Inter', sans-serif",
                fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3,
              }}>{item.label}</div>
              <div style={{
                fontSize: 14, color: NAVY, fontFamily: "'Inter', sans-serif", fontWeight: 500,
              }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Gold accent line */}
        <div style={{ height: 1.5, background: `linear-gradient(90deg, ${GOLD}, ${GOLD}44)`, marginBottom: 18, width: 48 }} />

        {/* Price */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{
              fontSize: 10, color: "#999", fontFamily: "'Inter', sans-serif",
              fontWeight: 500, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3,
            }}>Weekly Charter Rate</div>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              {priceLow === priceHigh ? (
                <span style={{ fontSize: 18, color: NAVY, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                  {priceHigh}
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 14, color: "#777", fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
                    {priceLow}
                  </span>
                  <span style={{ fontSize: 11, color: "#aaa" }}>—</span>
                  <span style={{ fontSize: 18, color: NAVY, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                    {priceHigh}
                  </span>
                </>
              )}
            </div>
            {hasDiscount && (
              <div style={{
                fontSize: 11, color: "#999", fontFamily: "'Inter', sans-serif",
                textDecoration: "line-through", marginTop: 2,
              }}>
                was €{yacht.price_high.toLocaleString()}
              </div>
            )}
          </div>
          <div style={{
            fontSize: 10, color: RED_ACCENT, fontFamily: "'Inter', sans-serif",
            fontWeight: 600, letterSpacing: 2, cursor: "pointer",
            padding: "8px 0", transition: "opacity 0.3s ease",
            opacity: hovered ? 1 : 0.75,
          }}>
            VIEW DETAILS →
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Yacht Detail Modal ──
function YachtDetail({ yacht, discount, isFav, onToggleFav, onClose, brokerFriendly, imageUrl, eBrochureUrl, bookings, slug, onSubmitEnquiry }) {
  const hasDiscount = discount > 0 && typeof yacht.price_high === "number";
  const hasImage = !!imageUrl;
  const brochureHref = yacht.brochure_url || eBrochureUrl || null;
  const hasBookings = bookings && bookings.length > 0;
  // Format bookings for AvailabilityCalendar
  const calendarBookings = hasBookings ? bookings.map(b => ({
    start_date: b.start, end_date: b.end, status: b.status, route: b.route
  })) : [];

  return (
    <div className="rb-detail-modal" style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,29,47,0.85)", backdropFilter: "blur(10px)",
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      overflowY: "auto", padding: "40px 20px",
    }} onClick={onClose}>
      <div className="rb-detail-inner" style={{
        background: WHITE, maxWidth: 900, width: "100%",
        boxShadow: "0 40px 100px rgba(0,0,0,0.3)",
        borderRadius: 18, overflow: "hidden",
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header image */}
        <div className="rb-detail-image" style={{
          height: 380,
          background: hasImage
            ? `url(${imageUrl}) center/cover`
            : `linear-gradient(145deg, ${NAVY} 0%, ${NAVY_LIGHT} 45%, #1e3a5f 100%)`,
          position: "relative",
        }}>
          {!hasImage && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 14,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: "50%",
                border: "1.5px solid rgba(201,169,110,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: 30, color: "rgba(201,169,110,0.4)" }}>⚓</div>
              </div>
              <div style={{
                fontSize: 10, color: "rgba(201,169,110,0.35)", letterSpacing: 3,
                fontFamily: "'Inter', sans-serif", textTransform: "uppercase", fontWeight: 400,
              }}>{yacht.name}</div>
            </div>
          )}
          <button onClick={onClose} style={{
            position: "absolute", top: 12, right: 12, width: 44, height: 44,
            borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.95)",
            color: NAVY, cursor: "pointer", fontSize: 22, display: "flex",
            alignItems: "center", justifyContent: "center",
            zIndex: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>×</button>
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "60px 40px 30px",
            background: "linear-gradient(transparent, rgba(15,29,47,0.9))",
          }}>
            <div style={{
              fontSize: 36, color: WHITE, fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 500, letterSpacing: 3,
            }}>{yacht.name}</div>
            <div style={{
              fontSize: 14, color: "rgba(255,255,255,0.6)", fontFamily: "'Inter', sans-serif",
              fontWeight: 300, marginTop: 6,
            }}>
              {yacht.length_m}m / {ftFromM(yacht.length_m)} · {yacht.builder} · {yacht.year_built}
              {yacht.year_refit ? ` (Refit ${yacht.year_refit})` : ""}
            </div>
          </div>
        </div>

        {/* Specs grid */}
        <div style={{ padding: "30px 40px" }}>
          <div className="rb-detail-specs" style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 24, marginBottom: 30,
          }}>
            {[
              { label: "Length", value: `${yacht.length_m}m / ${ftFromM(yacht.length_m)}` },
              { label: "Builder", value: yacht.builder },
              { label: "Year Built", value: yacht.year_built },
              { label: "Year Refit", value: yacht.year_refit || "—" },
              { label: "Cabins", value: yacht.cabins },
              { label: "Cabin Config", value: yacht.cabin_config },
              { label: "Guests", value: yacht.guests },
              { label: "Crew", value: yacht.crew },
              { label: "Summer Base", value: yacht.summer_port || "TBC" },
              { label: "Winter Base", value: yacht.winter_port || "TBC" },
            ].map((item, i) => (
              <div key={i}>
                <div style={{
                  fontSize: 10, color: "#999", fontFamily: "'Inter', sans-serif",
                  fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4,
                }}>{item.label}</div>
                <div style={{
                  fontSize: 14, color: NAVY, fontFamily: "'Inter', sans-serif", fontWeight: 500,
                }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Key features */}
          {yacht.features && (
            <div className="rb-detail-features" style={{ marginBottom: 30 }}>
              <div style={{
                fontSize: 10, color: RED_ACCENT, fontFamily: "'Inter', sans-serif",
                fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12,
              }}>Key Features</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {yacht.features.map((f, i) => (
                  <span key={i} style={{
                    padding: "6px 14px", background: CREAM, fontSize: 12,
                    fontFamily: "'Inter', sans-serif", color: NAVY, fontWeight: 400,
                  }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Red divider */}
          <div style={{ height: 2, background: RED_ACCENT, width: 50, marginBottom: 24 }} />

          {/* Price section */}
          <div className="rb-detail-price" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20, marginBottom: 24 }}>
            <div>
              <div style={{
                fontSize: 10, color: "#999", fontFamily: "'Inter', sans-serif",
                fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6,
              }}>Weekly Charter Rate</div>
              <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: "#777", fontFamily: "'Inter', sans-serif" }}>Low</span>
                <span style={{ fontSize: 22, color: NAVY, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                  {formatPrice(yacht.price_low, discount)}
                </span>
                <span style={{ fontSize: 12, color: "#777", fontFamily: "'Inter', sans-serif" }}>High</span>
                <span style={{ fontSize: 22, color: NAVY, fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>
                  {formatPrice(yacht.price_high, discount)}
                </span>
              </div>
              {hasDiscount && (
                <div style={{
                  fontSize: 12, color: RED_ACCENT, fontFamily: "'Inter', sans-serif",
                  fontWeight: 500, marginTop: 4,
                }}>
                  {discount}% discount applied · was €{yacht.price_high.toLocaleString()} / €{yacht.price_low.toLocaleString()}
                </div>
              )}
            </div>

            <div className="rb-detail-actions" style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => onToggleFav(yacht.id)}
                style={{
                  padding: "12px 24px", background: isFav ? RED_ACCENT : "transparent",
                  border: `1px solid ${isFav ? RED_ACCENT : NAVY}`,
                  color: isFav ? WHITE : NAVY, fontSize: 12, fontFamily: "'Inter', sans-serif",
                  fontWeight: 500, letterSpacing: 1.5, cursor: "pointer",
                  textTransform: "uppercase", transition: "all 0.3s ease",
                }}
              >
                {isFav ? "♥ Shortlisted" : "♡ Shortlist"}
              </button>
              {brochureHref && (
              <a href={brochureHref} target="_blank" rel="noopener noreferrer" style={{
                padding: "12px 24px", background: NAVY, border: "none",
                color: WHITE, fontSize: 12, fontFamily: "'Inter', sans-serif",
                fontWeight: 500, letterSpacing: 1.5, cursor: "pointer",
                textTransform: "uppercase", textDecoration: "none",
                display: "flex", alignItems: "center",
              }}>
                E-Brochure →
              </a>
              )}
            </div>
          </div>

          {/* Booking Availability */}
          {hasBookings && (
            <div className="rb-booking-section" style={{ padding: "0 40px 30px" }}>
              <div style={{
                fontSize: 10, color: "#999", fontFamily: "'Inter', sans-serif",
                fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12,
              }}>Confirmed Bookings</div>
              <div style={{
                border: "1px solid #eee", borderRadius: 10, overflow: "hidden",
              }}>
                {/* Header */}
                <div className="rb-booking-header rb-booking-grid" style={{
                  display: "grid", gridTemplateColumns: "1.2fr 1.2fr 90px 1.8fr",
                  padding: "10px 16px", background: NAVY, color: "rgba(255,255,255,0.7)",
                  fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
                  fontFamily: "'Inter', sans-serif",
                }}>
                  <div>From</div>
                  <div>To</div>
                  <div>Status</div>
                  <div>Route</div>
                </div>
                {/* Rows */}
                {bookings.map((b, i) => {
                  const fmtDate = (d) => {
                    if (!d) return "—";
                    try {
                      return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                    } catch { return d; }
                  };
                  const st = (b.status || "").toLowerCase();
                  const pillStyle = st.includes("option") ? { bg: "#fef3cd", color: "#856404" }
                    : st.includes("transit") ? { bg: "#dbeafe", color: "#1e40af" }
                    : st.includes("shipyard") ? { bg: "#e5e7eb", color: "#374151" }
                    : st.includes("unavailable") ? { bg: "#e5e7eb", color: "#6b7280" }
                    : st.includes("boat show") ? { bg: "#ede9fe", color: "#5b21b6" }
                    : { bg: "#fecdd3", color: "#9b1c31" };
                  return (
                    <div key={i} className="rb-booking-grid" style={{
                      display: "grid", gridTemplateColumns: "1.2fr 1.2fr 90px 1.8fr",
                      padding: "10px 16px", borderBottom: i < bookings.length - 1 ? "1px solid #f0f0f0" : "none",
                      background: i % 2 === 0 ? "#fafaf8" : WHITE,
                      fontSize: 13, fontFamily: "'Inter', sans-serif", color: NAVY,
                      alignItems: "center",
                    }}>
                      <div style={{ fontSize: 12 }}>{fmtDate(b.start)}</div>
                      <div style={{ fontSize: 12 }}>{fmtDate(b.end)}</div>
                      <div>
                        <span style={{
                          display: "inline-block", padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: pillStyle.bg, color: pillStyle.color, letterSpacing: 0.3,
                        }}>
                          {(b.status || "Booked").replace(/^./, c => c.toUpperCase())}
                        </span>
                      </div>
                      <div style={{ color: "#777", fontSize: 11, lineHeight: 1.4 }}>{b.route || "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Availability Calendar */}
          <div className="rb-calendar-section" style={{ padding: "0 40px 30px" }}>
            <AvailabilityCalendar
              yacht={yacht}
              bookings={calendarBookings}
              slug={slug}
              onSubmitEnquiry={onSubmitEnquiry}
            />
          </div>

          {/* Back button */}
          <div className="rb-back-btn" style={{ padding: "0 40px 30px", textAlign: "center" }}>
            <button onClick={onClose} style={{
              padding: "12px 32px", background: "transparent",
              border: `1px solid #ccc`, color: "#777", fontSize: 11,
              fontFamily: "'Inter', sans-serif", fontWeight: 500,
              letterSpacing: 1.5, textTransform: "uppercase",
              cursor: "pointer", borderRadius: 6,
            }}>
              ← Back to Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Comparison Table ──
function ComparisonTable({ yachts, discount, favourites }) {
  const selected = yachts.filter((y) => favourites.has(y.id));
  if (selected.length < 2) return null;

  const fields = [
    { key: "length_m", label: "Length", fmt: (v) => `${v}m / ${ftFromM(v)}` },
    { key: "builder", label: "Builder" },
    { key: "year_built", label: "Year Built" },
    { key: "year_refit", label: "Year Refit", fmt: (v) => v || "—" },
    { key: "cabins", label: "Cabins" },
    { key: "cabin_config", label: "Cabin Config" },
    { key: "guests", label: "Guests" },
    { key: "crew", label: "Crew" },
    { key: "price_low", label: "Low Season", fmt: (v) => formatPrice(v, discount) },
    { key: "price_high", label: "High Season", fmt: (v) => formatPrice(v, discount) },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse", fontFamily: "'Inter', sans-serif",
      }}>
        <thead>
          <tr>
            <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 10, letterSpacing: 1.5, color: "#999", fontWeight: 600, textTransform: "uppercase", borderBottom: `2px solid ${NAVY}` }}></th>
            {selected.map((y) => (
              <th key={y.id} style={{
                padding: "12px 16px", textAlign: "left", fontSize: 16,
                fontFamily: "'Cormorant Garamond', serif", color: NAVY,
                fontWeight: 600, borderBottom: `2px solid ${NAVY}`, letterSpacing: 1,
              }}>{y.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field, i) => (
            <tr key={field.key} style={{ background: i % 2 === 0 ? CREAM : WHITE }}>
              <td style={{
                padding: "10px 16px", fontSize: 10, letterSpacing: 1.5, color: "#999",
                fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap",
              }}>{field.label}</td>
              {selected.map((y) => (
                <td key={y.id} style={{
                  padding: "10px 16px", fontSize: 13, color: NAVY, fontWeight: 500,
                }}>{field.fmt ? field.fmt(y[field.key]) : y[field.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Broker Section ──
function BrokerSection() {
  return (
    <div className="rb-broker-section" style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
      minHeight: 400,
    }}>
      {/* Photo placeholder */}
      <div className="rb-broker-left" style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_LIGHT} 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 40,
      }}>
        <img src={JOSH_PHOTO} alt="Josh Cripps" style={{
          width: 180, height: 180, borderRadius: "50%",
          objectFit: "cover", objectPosition: "center top",
          border: "3px solid rgba(255,255,255,0.15)", marginBottom: 20,
        }} />
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "'Inter', sans-serif",
          fontWeight: 300, letterSpacing: 1,
        }}>{BROKER.email}</div>
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.5)", fontFamily: "'Inter', sans-serif",
          fontWeight: 300, letterSpacing: 1, marginTop: 4,
        }}>{BROKER.phone}</div>
      </div>

      {/* Bio */}
      <div className="rb-broker-right" style={{
        background: WHITE, padding: 50, display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <div style={{
          fontSize: 10, color: RED_ACCENT, fontFamily: "'Inter', sans-serif",
          fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12,
        }}>Your Broker</div>
        <div style={{
          fontSize: 32, color: NAVY, fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 500, letterSpacing: 2, marginBottom: 20,
        }}>{BROKER.name}</div>
        <div style={{ height: 2, background: RED_ACCENT, width: 40, marginBottom: 20 }} />
        <div style={{
          fontSize: 14, color: "#555", fontFamily: "'Inter', sans-serif",
          fontWeight: 300, lineHeight: 1.8,
        }}>{BROKER.bio}</div>
        <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{
            padding: "8px 16px", border: `1px solid ${NAVY}`, fontSize: 11,
            fontFamily: "'Inter', sans-serif", letterSpacing: 1.5, color: NAVY,
          }}>{BROKER.website}</span>
          <span style={{
            padding: "8px 16px", border: `1px solid ${NAVY}`, fontSize: 11,
            fontFamily: "'Inter', sans-serif", letterSpacing: 1.5, color: NAVY,
          }}>{BROKER.instagram}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function RoccabellaProposal() {
  const { slug } = useParams();
  const [stage, setStage] = useState("loading-data"); // loading-data → gate → loading → proposal
  const [proposal, setProposal] = useState(null);
  const [yachts, setYachts] = useState([]);
  const [error, setError] = useState(null);
  const [viewerName, setViewerName] = useState("");
  const [favourites, setFavourites] = useState(new Set());
  const [selectedYacht, setSelectedYacht] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [enquirySent, setEnquirySent] = useState(false);
  const [yachtImages, setYachtImages] = useState({}); // { yachtName: imageUrl }
  const [yachtBookings, setYachtBookings] = useState({}); // { yachtName: [{start, end, status, route}] }
  const [imagesLoading, setImagesLoading] = useState(true);

  // ── Fetch Proposal + Yachts from Supabase ──
  useEffect(() => {
    if (!slug) return;
    async function load() {
      try {
        const prop = await getProposalBySlug(slug);
        setProposal(prop);
        if (prop.yacht_ids && prop.yacht_ids.length > 0) {
          const yachtData = await getYachtsByIds(prop.yacht_ids);
          setYachts(yachtData || []);
        }
        // Restore shortlist
        try {
          const sl = await getShortlist(prop.id);
          if (sl && sl.length > 0) setFavourites(new Set(sl));
        } catch {}
        setStage("gate");
      } catch (e) {
        console.error("Failed to load proposal:", e);
        setError("Proposal not found or has expired.");
        setStage("error");
      }
    }
    load();
  }, [slug]);

  // ── Yachtfolio Image Fetching ──
  useEffect(() => {
    if (yachts.length === 0) return;
    async function fetchYachtImages() {
      try {
        // Step 1: Get the full yacht list
        const listRes = await fetch(`${YF_PROXY}?action=list`);
        const listData = await listRes.json();
        if (!listData.data || listData.data.length === 0) {
          setImagesLoading(false);
          return;
        }

        // Match yacht names from our proposal to Yachtfolio IDs (exact match only)
        const nameToId = {};
        for (const yfYacht of listData.data) {
          const yfName = (yfYacht.name || "").toUpperCase().trim();
          for (const proposalYacht of yachts) {
            const pName = proposalYacht.name.toUpperCase().trim();
            if (yfName === pName) {
              nameToId[proposalYacht.name] = yfYacht.id;
            }
          }
        }

        // Step 2: Fetch brochure for each matched yacht to get images + e-brochure links
        const images = {};
        const fetchPromises = Object.entries(nameToId).map(async ([name, yfId]) => {
          try {
            const brochureRes = await fetch(
              `${YF_PROXY}?action=brochure&id=${yfId}`
            );
            const brochureData = await brochureRes.json();

            // Safety check: validate length matches our proposal yacht (±3m tolerance)
            const proposalYacht = yachts.find(y => y.name === name);
            const yfLength = parseFloat(brochureData.loa || brochureData.length || 0);
            const pLength = parseFloat(proposalYacht?.length_m || 0);
            if (yfLength > 0 && pLength > 0 && Math.abs(yfLength - pLength) > 3) {
              console.warn(`Skipping images for ${name}: length mismatch (Yachtfolio: ${yfLength}m, Proposal: ${pLength}m)`);
              return;
            }

            const galleries = brochureData.galleries || {};
            const exteriorImages = galleries.EXTERIOR || [];
            const fullImages = galleries.FULL || [];
            const lifestyleImages = galleries.LIFESTYLE || [];

            let heroUrl = null;
            if (exteriorImages.length > 0) heroUrl = exteriorImages[0].url;
            else if (fullImages.length > 0) heroUrl = fullImages[0].url;
            else if (lifestyleImages.length > 0) heroUrl = lifestyleImages[0].url;

            if (heroUrl) images[name] = heroUrl;
            if (exteriorImages.length > 0 || fullImages.length > 0) {
              images[`${name}_gallery`] = [
                ...exteriorImages.map(i => i.url),
                ...fullImages.map(i => i.url),
                ...lifestyleImages.map(i => i.url),
              ].slice(0, 10);
            }
            // Store Yachtfolio e-brochure link
            images[`${name}_ebrochure`] = `https://www.yachtfolio.com/yacht/${yfId}`;
            // Store Yachtfolio ID for booking fetch
            images[`${name}_yfid`] = yfId;
          } catch (e) {
            console.warn(`Failed to fetch brochure for ${name} (ID: ${yfId}):`, e);
          }
        });

        await Promise.all(fetchPromises);
        setYachtImages(images);

        // Step 3: Fetch booking data from Supabase
        try {
          const yachtIds = yachts.map(y => y.id);
          const allBookings = await getBookingsByYachtIds(yachtIds);
          const bookingsByName = {};
          for (const b of allBookings) {
            const yacht = yachts.find(y => y.id === b.yacht_id);
            if (yacht) {
              if (!bookingsByName[yacht.name]) bookingsByName[yacht.name] = [];
              bookingsByName[yacht.name].push({
                start: b.start_date,
                end: b.end_date,
                status: b.status,
                route: b.route || null,
              });
            }
          }
          setYachtBookings(bookingsByName);
        } catch (e) {
          console.warn("Failed to fetch bookings:", e);
        }
      } catch (e) {
        console.warn("Yachtfolio API not available, using fallback images:", e);
      } finally {
        setImagesLoading(false);
      }
    }

    fetchYachtImages();
  }, [yachts]);

  // Helper to get yacht image (API → hero_image_url from DB → null)
  const getYachtImage = (yacht) => {
    if (yachtImages[yacht.name]) return yachtImages[yacht.name];
    if (yacht.hero_image_url) return yacht.hero_image_url;
    return null;
  };

  // Format date from ISO to readable
  const formatDate = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch { return iso; }
  };

  // ── PDF Generation ──
  const generatePDF = async () => {
    if (!proposal || yachts.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const margin = 50;
    const GOLD_PDF = "#c9a96e";
    const NAVY_PDF = "#0f1d2f";
    const CREAM_PDF = "#f7f5f0";
    const RED_PDF = "#c43a2b";

    // Proxy-based image fetching — bypasses CORS
    const fetchImageViaProxy = async (url) => {
      if (!url) return null;
      if (url.startsWith("data:")) return url;
      try {
        const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json.dataUri || null;
      } catch { return null; }
    };

    // Client-side fallback (for same-origin or data URIs)
    const toBase64Fallback = (url) => new Promise((resolve) => {
      if (!url) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          c.getContext("2d").drawImage(img, 0, 0);
          resolve(c.toDataURL("image/jpeg", 0.85));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });

    // Pre-fetch all yacht images via proxy, with fallback
    const imgCache = {};
    for (const y of yachts) {
      const url = getYachtImage(y);
      if (!url) continue;
      if (url.startsWith("data:")) { imgCache[y.name] = url; continue; }
      // Try proxy first
      let b64 = await fetchImageViaProxy(url);
      // Fallback to client-side canvas
      if (!b64) b64 = await toBase64Fallback(url);
      if (b64) imgCache[y.name] = b64;
    }

    // Resolve which logos to use (partner override if uploaded)
    let logoWhiteB64 = LOGO_WHITE;
    let logoNavyB64 = LOGO_NAVY;
    if (proposal.partner_logo_url) {
      let partnerB64 = await fetchImageViaProxy(proposal.partner_logo_url);
      if (!partnerB64) partnerB64 = await toBase64Fallback(proposal.partner_logo_url);
      if (partnerB64) {
        logoWhiteB64 = partnerB64;
        logoNavyB64 = partnerB64;
      }
    }

    const brokerPhotoB64 = JOSH_PHOTO;
    const isBF = proposal.broker_friendly;

    // ── Helper: draw branded placeholder when image is missing ──
    const drawPlaceholder = (x, y, w, h, name) => {
      doc.setFillColor(15, 29, 47);
      doc.rect(x, y, w, h, "F");
      // Gold accent line
      doc.setDrawColor(201, 169, 110);
      doc.setLineWidth(1.5);
      doc.line(x + 20, y + h / 2 - 12, x + 60, y + h / 2 - 12);
      // Yacht name in gold
      doc.setTextColor(201, 169, 110);
      const fontSize = w > 200 ? 16 : 10;
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "normal");
      doc.text(name || "", x + 20, y + h / 2 + 6);
    };

    // PAGE 1 — Cover
    doc.setFillColor(CREAM_PDF);
    doc.rect(0, 0, W / 2, H, "F");
    doc.setFillColor(NAVY_PDF);
    doc.rect(W / 2, 0, W / 2, H, "F");
    if (!isBF) { try { doc.addImage(logoNavyB64, "PNG", margin, H / 2 - 60, 140, 50); } catch {} }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(isBF ? "CHARTER YACHT SELECTION" : "PRIVATE CHARTER PROPOSAL", W / 2 + 60, H / 2 - 40);
    doc.setFontSize(11);
    doc.setTextColor(201, 169, 110);
    doc.text((proposal.title || "").toUpperCase(), W / 2 + 60, H / 2 - 15);
    if (!isBF) {
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("LONDON   ·   DUBAI   ·   GENEVA   ·   PALMA   ·   MIAMI", W / 2 + 60, H - 50);
    }

    // PAGE 2 — Proposal Intro
    doc.addPage();
    doc.setFillColor(CREAM_PDF);
    doc.rect(0, 0, W, H, "F");
    doc.setDrawColor(GOLD_PDF);
    doc.setLineWidth(1);
    doc.line(margin, 80, margin + 60, 80);
    doc.setTextColor(NAVY_PDF);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(isBF ? "YACHT CHARTER SELECTION" : "PREPARED EXCLUSIVELY FOR", margin, 110);
    if (!isBF) {
      doc.setFontSize(28);
      doc.setFont("helvetica", "normal");
      doc.text(proposal.client_name, margin, 150);
    }
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    const introY = isBF ? 140 : 190;
    doc.text(`Destination: ${proposal.destination || ""}`, margin, introY);
    doc.text(`Date: ${formatDate(proposal.created_at)}`, margin, introY + 20);
    if (proposal.discount > 0) {
      doc.setTextColor(RED_PDF);
      doc.setFontSize(11);
      doc.text(`${proposal.discount}% exclusive discount applied to all rates`, margin, introY + 55);
    }
    if (!isBF && proposal.message) {
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      const msgLines = doc.splitTextToSize(`"${proposal.message}"`, W - margin * 2 - 100);
      doc.text(msgLines, margin, introY + 100);
      doc.setDrawColor(GOLD_PDF);
      doc.line(margin, introY + 100 + msgLines.length * 14 + 20, margin + 60, introY + 100 + msgLines.length * 14 + 20);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(NAVY_PDF);
      doc.setFontSize(11);
      doc.text(BROKER.name, margin, introY + 100 + msgLines.length * 14 + 50);
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(BROKER.email + "  |  " + BROKER.phone, margin, introY + 100 + msgLines.length * 14 + 68);
    }

    // PAGE 3 — Fleet Overview
    doc.addPage();
    doc.setFillColor(CREAM_PDF);
    doc.rect(0, 0, W, H, "F");
    doc.setTextColor(NAVY_PDF);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("YOUR CURATED FLEET", margin, 55);
    doc.setDrawColor(GOLD_PDF);
    doc.line(margin, 62, margin + 60, 62);
    const thumbW = 130, thumbH = 85;
    const cardW = (W - margin * 2 - 40) / Math.min(yachts.length, 3);
    const startY = 85;
    yachts.forEach((y, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const x = margin + col * (cardW + 15);
      const yPos = startY + row * 210;
      const b64 = imgCache[y.name];
      if (b64) { try { doc.addImage(b64, "JPEG", x, yPos, thumbW, thumbH); } catch { drawPlaceholder(x, yPos, thumbW, thumbH, y.name); } }
      else { drawPlaceholder(x, yPos, thumbW, thumbH, y.name); }
      doc.setTextColor(NAVY_PDF); doc.setFontSize(14); doc.setFont("helvetica","bold"); doc.text(y.name, x, yPos+thumbH+20);
      doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.setTextColor(100,100,100);
      doc.text(`${y.length_m}m  ·  ${y.builder}  ·  ${y.year_built}${y.year_refit ? " / Refit "+y.year_refit : ""}`, x, yPos+thumbH+35);
      doc.text(`${y.guests} guests  ·  ${y.cabins} cabins  ·  ${y.crew} crew`, x, yPos+thumbH+50);
      doc.setTextColor(NAVY_PDF); doc.setFontSize(10); doc.setFont("helvetica","bold");
      const priceStr = y.price_low === y.price_high ? formatPrice(y.price_high, proposal.discount)+" /week" : formatPrice(y.price_low, proposal.discount)+" – "+formatPrice(y.price_high, proposal.discount)+" /week";
      doc.text(priceStr, x, yPos+thumbH+68);
    });

    // Individual yacht pages
    for (const y of yachts) {
      doc.addPage();
      doc.setFillColor(CREAM_PDF); doc.rect(0,0,W,H,"F");
      const heroW=W/2-30,heroH=H-100,heroX=W/2+10,heroY=50;
      const b64=imgCache[y.name];
      if(b64){try{doc.addImage(b64,"JPEG",heroX,heroY,heroW,heroH);}catch{drawPlaceholder(heroX,heroY,heroW,heroH,y.name);}}
      else{drawPlaceholder(heroX,heroY,heroW,heroH,y.name);}
      const lx=margin;let ly=55;
      doc.setTextColor(NAVY_PDF);doc.setFontSize(22);doc.setFont("helvetica","bold");doc.text(y.name,lx,ly);ly+=20;
      doc.setDrawColor(GOLD_PDF);doc.setLineWidth(1.5);doc.line(lx,ly,lx+50,ly);ly+=25;
      const specs=[["Length",`${y.length_m}m / ${ftFromM(y.length_m)}`],["Builder",y.builder],["Year Built",`${y.year_built}`],["Year Refit",y.year_refit?`${y.year_refit}`:"—"],["Guests",`${y.guests}`],["Cabins",`${y.cabins}`],["Configuration",y.cabin_config||"—"],["Crew",`${y.crew}`],["Summer Port",y.summer_port||"TBC"],["Winter Port",y.winter_port||"TBC"]];
      for(const[label,val]of specs){doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text(label.toUpperCase(),lx,ly);doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(NAVY_PDF);doc.text(val,lx,ly+14);ly+=34;}
      if(y.features&&y.features.length>0){ly+=8;doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text("KEY FEATURES",lx,ly);ly+=16;doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(NAVY_PDF);y.features.forEach(f=>{doc.text("•  "+f,lx,ly);ly+=14;});}
      ly+=14;doc.setDrawColor(GOLD_PDF);doc.setLineWidth(1);doc.line(lx,ly,lx+50,ly);ly+=18;
      doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(150,150,150);doc.text("CHARTER RATE",lx,ly);ly+=15;
      doc.setFontSize(14);doc.setTextColor(NAVY_PDF);
      const rateStr=y.price_low===y.price_high?formatPrice(y.price_high,proposal.discount)+" /week":formatPrice(y.price_low,proposal.discount)+" – "+formatPrice(y.price_high,proposal.discount)+" /week";
      doc.text(rateStr,lx,ly);
    }

    // Comparison table page
    doc.addPage();doc.setFillColor(CREAM_PDF);doc.rect(0,0,W,H,"F");
    doc.setTextColor(NAVY_PDF);doc.setFontSize(10);doc.setFont("helvetica","bold");doc.text("FLEET COMPARISON",margin,55);
    doc.setDrawColor(GOLD_PDF);doc.line(margin,62,margin+60,62);
    const cols=["", ...yachts.map(y=>y.name)];const colW=(W-margin*2)/cols.length;let ty=85;
    doc.setFillColor(NAVY_PDF);doc.rect(margin,ty-12,W-margin*2,22,"F");doc.setTextColor(255,255,255);doc.setFontSize(8);doc.setFont("helvetica","bold");
    cols.forEach((c,i)=>{doc.text(c,margin+i*colW+8,ty+2);});ty+=22;
    const tableFields=[{label:"LENGTH",fmt:y=>`${y.length_m}m`},{label:"BUILDER",fmt:y=>y.builder},{label:"YEAR",fmt:y=>`${y.year_built}${y.year_refit?" / "+y.year_refit:""}`},{label:"GUESTS",fmt:y=>`${y.guests}`},{label:"CABINS",fmt:y=>`${y.cabins}`},{label:"CONFIGURATION",fmt:y=>y.cabin_config||"—"},{label:"CREW",fmt:y=>`${y.crew}`},{label:"SUMMER PORT",fmt:y=>y.summer_port||"TBC"},{label:"WINTER PORT",fmt:y=>y.winter_port||"TBC"},{label:"LOW SEASON",fmt:y=>formatPrice(y.price_low,proposal.discount)},{label:"HIGH SEASON",fmt:y=>formatPrice(y.price_high,proposal.discount)}];
    tableFields.forEach((field,ri)=>{if(ri%2===0){doc.setFillColor(247,245,240);doc.rect(margin,ty-10,W-margin*2,20,"F");}doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text(field.label,margin+8,ty+2);doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(NAVY_PDF);yachts.forEach((y,ci)=>{doc.text(field.fmt(y),margin+(ci+1)*colW+8,ty+2);});ty+=22;});

    // Broker page (client-facing only)
    if (!isBF) {
      doc.addPage();
      doc.setFillColor(NAVY_PDF);doc.rect(0,0,W/2,H,"F");
      try{doc.addImage(brokerPhotoB64,"JPEG",W/4-55,H/2-100,110,110);}catch{}
      doc.setTextColor(201,169,110);doc.setFontSize(9);doc.setFont("helvetica","normal");
      doc.text(BROKER.email,W/4-55,H/2+30);doc.text(BROKER.phone,W/4-55,H/2+45);
      doc.setFillColor(255,255,255);doc.rect(W/2,0,W/2,H,"F");
      const bx=W/2+50;let by=H/2-80;
      doc.setTextColor(RED_PDF);doc.setFontSize(8);doc.setFont("helvetica","bold");doc.text("YOUR BROKER",bx,by);by+=28;
      doc.setTextColor(NAVY_PDF);doc.setFontSize(24);doc.setFont("helvetica","normal");doc.text(BROKER.name,bx,by);by+=18;
      doc.setDrawColor(RED_PDF);doc.setLineWidth(2);doc.line(bx,by,bx+40,by);by+=25;
      doc.setTextColor(80,80,80);doc.setFontSize(9);doc.setFont("helvetica","normal");
      const bioLines=doc.splitTextToSize(BROKER.bio,W/2-100);doc.text(bioLines,bx,by);by+=bioLines.length*12+20;
      doc.setTextColor(NAVY_PDF);doc.setFontSize(9);doc.text(BROKER.website+"   |   "+BROKER.instagram,bx,by);
    }

    // Closing page
    doc.addPage();doc.setFillColor(NAVY_PDF);doc.rect(0,0,W,H,"F");
    if(!isBF){try{doc.addImage(logoWhiteB64,"PNG",W/2-70,H/2-80,140,50);}catch{}}
    doc.setTextColor(201,169,110);doc.setFontSize(16);doc.setFont("helvetica","italic");
    doc.text(isBF ? "Charter Yacht Selection" : "An Experience Like No Other",W/2,H/2+10,{align:"center"});
    if(!isBF){
      doc.setTextColor(255,255,255);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("LONDON   ·   DUBAI   ·   GENEVA   ·   PALMA   ·   MIAMI",W/2,H/2+50,{align:"center"});
      doc.setTextColor(150,150,150);doc.setFontSize(7);doc.text("Connect with your broker:",W/2,H/2+80,{align:"center"});
      doc.setTextColor(201,169,110);doc.text(BROKER.email+"   |   "+BROKER.phone,W/2,H/2+95,{align:"center"});
      doc.setTextColor(100,100,100);doc.setFontSize(6);doc.text("© 2026 Roccabella Yachts. All rights reserved.",W/2,H-40,{align:"center"});
    } else {
      doc.setTextColor(150,150,150);doc.setFontSize(7);doc.text("All particulars are given in good faith and believed correct but not guaranteed.",W/2,H/2+50,{align:"center"});
    }

    const safeName = proposal.client_name.replace(/[^a-zA-Z0-9]/g, "_");
    const safeTitle = (proposal.title || "Selection").replace(/[^a-zA-Z0-9]/g, "_");
    doc.save(isBF ? `Charter_Selection_${safeTitle}.pdf` : `Roccabella_Proposal_${safeName}.pdf`);
    trackEvent(proposal.id, "pdf_download", { viewerName });
  };

  const handleEnter = (name) => {
    setViewerName(name);
    setStage("loading");
    trackEvent(proposal.id, "entry_gate", { viewerName: name });
  };

  const toggleFav = async (id) => {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        removeFromShortlist(proposal.id, id).catch(() => {});
      } else {
        next.add(id);
        addToShortlist(proposal.id, id, viewerName).catch(() => {});
      }
      return next;
    });
  };

  const handleEnquiry = async () => {
    const shortlistedIds = Array.from(favourites);
    try {
      await submitEnquiry(proposal.id, viewerName, shortlistedIds, "Interested in shortlisted yachts");
      setEnquirySent(true);
      setTimeout(() => setEnquirySent(false), 3000);
    } catch (e) {
      console.error("Enquiry failed:", e);
    }
  };

  // Google Fonts
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Inter:wght@300;400;500;600&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  // Track page view when proposal loads
  useEffect(() => {
    if (proposal && stage === "proposal") {
      trackEvent(proposal.id, "page_view", { viewerName });
    }
  }, [proposal, stage, viewerName]);

  // ── Loading / Error states ──
  if (stage === "loading-data") return (
    <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, letterSpacing: 3, textTransform: "uppercase" }}>Loading proposal...</div>
    </div>
  );

  if (stage === "error") return (
    <div style={{ position: "fixed", inset: 0, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, letterSpacing: 1 }}>{error}</div>
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Please check the link or contact your broker.</div>
    </div>
  );

  if (stage === "gate") return (
    <EntryGate
      onEnter={handleEnter}
      brokerFriendly={proposal.broker_friendly}
      clientName={proposal.client_name}
      partnerLogoUrl={proposal.partner_logo_url}
    />
  );
  if (stage === "loading") return (
    <LoadingScreen
      onComplete={() => setStage("proposal")}
      brokerFriendly={proposal.broker_friendly}
      clientName={proposal.client_name}
      partnerLogoUrl={proposal.partner_logo_url}
    />
  );

  const isBF = proposal.broker_friendly;

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      {/* Responsive mobile styles */}
      <style>{`
        @media (max-width: 768px) {
          .rb-detail-image { height: 240px !important; }
          .rb-detail-modal { padding: 0 !important; }
          .rb-detail-inner { border-radius: 0 !important; min-height: 100vh !important; }
          .rb-detail-specs { grid-template-columns: repeat(2, 1fr) !important; gap: 14px !important; padding: 20px 20px 0 !important; }
          .rb-detail-actions { flex-direction: column !important; padding: 0 20px !important; }
          .rb-detail-actions > * { width: 100% !important; text-align: center !important; justify-content: center !important; box-sizing: border-box !important; }
          .rb-detail-features { padding: 0 20px 20px !important; }
          .rb-detail-price { padding: 0 20px 20px !important; }
          .rb-booking-section { padding: 0 20px 20px !important; }
          .rb-booking-grid { grid-template-columns: 1fr 1fr 80px !important; font-size: 11px !important; padding: 8px 10px !important; }
          .rb-booking-grid > div:nth-child(4) { display: none !important; }
          .rb-booking-header > div:nth-child(4) { display: none !important; }
          .rb-calendar-section { padding: 0 20px 20px !important; }
          .rb-back-btn { padding: 0 20px 30px !important; }
          .rb-fleet-grid { grid-template-columns: 1fr !important; }
          .rb-broker-section { grid-template-columns: 1fr !important; }
          .rb-broker-left { padding: 40px 24px !important; }
          .rb-broker-right { padding: 30px 24px !important; }
          .rb-enquiry-grid { grid-template-columns: 1fr !important; }
          .rb-yacht-name-overlay { font-size: 20px !important; letter-spacing: 1.5px !important; }
          .rb-detail-yacht-name { font-size: 26px !important; }
        }
        @media (max-width: 480px) {
          .rb-detail-image { height: 200px !important; }
          .rb-header-title { font-size: 22px !important; }
          .rb-fleet-grid { gap: 16px !important; }
          .rb-booking-grid { grid-template-columns: 1fr 1fr !important; }
          .rb-booking-grid > div:nth-child(4n+3) { display: none !important; }
          .rb-booking-header > div:nth-child(3) { display: none !important; }
        }
      `}</style>
      {/* Detail modal */}
      {selectedYacht && (
        <YachtDetail
          yacht={selectedYacht}
          discount={proposal.discount}
          isFav={favourites.has(selectedYacht.id)}
          onToggleFav={toggleFav}
          onClose={() => setSelectedYacht(null)}
          brokerFriendly={isBF}
          imageUrl={getYachtImage(selectedYacht)}
          eBrochureUrl={yachtImages[`${selectedYacht.name}_ebrochure`] || null}
          bookings={yachtBookings[selectedYacht.name] || null}
          slug={slug}
          onSubmitEnquiry={submitCharterEnquiry}
        />
      )}

      {/* ── HEADER ── */}
      <header style={{
        background: `linear-gradient(170deg, ${NAVY} 0%, ${NAVY_MID} 100%)`, padding: "48px 0 56px", textAlign: "center",
      }}>
        {!isBF && (
          <img
            src={proposal.partner_logo_url || LOGO_WHITE}
            alt={proposal.partner_logo_url ? "Partner" : "Roccabella Yachts"}
            onError={(e) => { e.currentTarget.src = LOGO_WHITE; }}
            style={{
              height: 44, marginBottom: 28, display: "block", margin: "0 auto 28px",
              opacity: 0.95, objectFit: "contain", maxWidth: 240,
            }}
          />
        )}
        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}44, transparent)`, width: 120, margin: "0 auto 34px" }} />
        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2,
          textTransform: "uppercase", fontWeight: 300, marginBottom: 8,
        }}>{isBF ? "Charter Yacht Selection" : "Private Charter Proposal"}</div>
        <div style={{
          fontSize: 28, color: WHITE, fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 400, marginBottom: 8,
        }}>{proposal.title}</div>
        {!isBF && (
          <div style={{
            fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 300,
          }}>Prepared for {proposal.client_name} · {formatDate(proposal.created_at)}</div>
        )}
      </header>

      {/* ── PERSONAL MESSAGE (client-facing only) ── */}
      {!isBF && (
        <div style={{
          maxWidth: 720, margin: "0 auto", padding: "56px 24px 44px", textAlign: "center",
        }}>
          <div style={{
            fontSize: 17, color: "#555", fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400, lineHeight: 2, fontStyle: "italic",
          }}>"{proposal.message}"</div>
          <div style={{
            width: 40, height: 1, background: GOLD, margin: "20px auto 16px", opacity: 0.5,
          }} />
          <div style={{
            fontSize: 12, color: NAVY, fontFamily: "'Inter', sans-serif",
            fontWeight: 500, letterSpacing: 2, textTransform: "uppercase",
          }}>Josh Cripps</div>
        </div>
      )}

      {/* ── DISCOUNT BANNER ── */}
      {proposal.discount > 0 && (
        <div style={{
          background: `linear-gradient(90deg, ${NAVY} 0%, ${NAVY_MID} 100%)`,
          padding: "18px 24px", textAlign: "center",
          borderBottom: `1px solid rgba(201,169,110,0.15)`,
          marginBottom: 0,
        }}>
          <span style={{
            fontSize: 11, color: GOLD, fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400, letterSpacing: 4, textTransform: "uppercase",
            fontStyle: "italic",
          }}>
            ✦ &nbsp;{proposal.discount}% exclusive discount applied to all rates&nbsp; ✦
          </span>
        </div>
      )}

      {/* ── YACHT SELECTION ── */}
      <div style={{
        maxWidth: 1200, margin: "0 auto", padding: "50px 24px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{
            fontSize: 9, color: GOLD, fontFamily: "'Inter', sans-serif",
            fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", marginBottom: 12,
          }}>Yacht Selection</div>
          <div style={{
            fontSize: 28, color: NAVY, fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400, letterSpacing: 1,
          }}>Your Curated Fleet</div>
          <div style={{
            width: 48, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, margin: "16px auto 0",
          }} />
        </div>
        <div className="rb-fleet-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 24,
        }}>
        {yachts.map((yacht) => (
            <div key={yacht.id}>
              <YachtCard
                yacht={yacht}
                discount={proposal.discount}
                isFav={favourites.has(yacht.id)}
                onToggleFav={toggleFav}
                onSelect={setSelectedYacht}
                imageUrl={getYachtImage(yacht)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── SHORTLIST BAR ── */}
      {favourites.size > 0 && (
        <div style={{
          background: NAVY, padding: "20px 24px",
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: 20, flexWrap: "wrap",
        }}>
          <span style={{
            fontSize: 13, color: "rgba(255,255,255,0.6)", fontFamily: "'Inter', sans-serif",
          }}>
            {favourites.size} yacht{favourites.size > 1 ? "s" : ""} shortlisted:
            {" "}{yachts.filter((y) => favourites.has(y.id)).map((y) => y.name).join(", ")}
          </span>
          {favourites.size >= 2 && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              style={{
                padding: "8px 20px", background: "transparent",
                border: "1px solid rgba(255,255,255,0.3)", color: WHITE,
                fontSize: 11, letterSpacing: 1.5, cursor: "pointer",
                fontFamily: "'Inter', sans-serif", textTransform: "uppercase",
              }}
            >
              {showComparison ? "Hide" : "Compare"}
            </button>
          )}
          <button
            onClick={handleEnquiry}
            style={{
              padding: "8px 20px", background: RED_ACCENT,
              border: "none", color: WHITE,
              fontSize: 11, letterSpacing: 1.5, cursor: "pointer",
              fontFamily: "'Inter', sans-serif", textTransform: "uppercase",
            }}
          >
            {enquirySent ? "✓ Enquiry Sent" : "Enquire About Selection"}
          </button>
        </div>
      )}

      {/* ── COMPARISON TABLE ── */}
      {showComparison && favourites.size >= 2 && (
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "50px 24px",
        }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{
              fontSize: 10, color: RED_ACCENT, fontFamily: "'Inter', sans-serif",
              fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", marginBottom: 10,
            }}>Comparison</div>
            <div style={{
              fontSize: 26, color: NAVY, fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 400,
            }}>Side by Side</div>
          </div>
          <ComparisonTable yachts={yachts} discount={proposal.discount} favourites={favourites} />
        </div>
      )}

      {/* ── ITINERARY LINK (client-facing only) ── */}
      {!isBF && proposal.itinerary_link && (
        <div style={{
          background: NAVY_MID, padding: "50px 24px", textAlign: "center",
        }}>
          <div style={{
            fontSize: 10, color: GOLD, fontFamily: "'Inter', sans-serif",
            fontWeight: 600, letterSpacing: 3, textTransform: "uppercase", marginBottom: 12,
          }}>Charter Itinerary</div>
          <div style={{
            fontSize: 22, color: WHITE, fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 400, marginBottom: 20,
          }}>Explore Your Sample Itinerary</div>
          <a href={proposal.itinerary_link} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-block", padding: "14px 40px", border: `1px solid ${GOLD}`,
            color: GOLD, fontSize: 11, letterSpacing: 2, textDecoration: "none",
            fontFamily: "'Inter', sans-serif", fontWeight: 500, textTransform: "uppercase",
            transition: "all 0.3s ease",
          }}>
            View Itinerary →
          </a>
        </div>
      )}

      {/* ── BROKER BIO (client-facing only) ── */}
      {!isBF && <BrokerSection />}

      {/* ── FOOTER ── */}
      <footer style={{
        background: `linear-gradient(170deg, ${NAVY} 0%, ${NAVY_MID} 100%)`, padding: "48px 24px", textAlign: "center",
      }}>
        {!isBF && (
          <img
            src={proposal.partner_logo_url || LOGO_WHITE}
            alt={proposal.partner_logo_url ? "Partner" : "Roccabella Yachts"}
            onError={(e) => { e.currentTarget.src = LOGO_WHITE; }}
            style={{
              height: 36, marginBottom: 20, display: "block", margin: "0 auto 20px",
              opacity: 0.85, objectFit: "contain", maxWidth: 200,
            }}
          />
        )}
        {isBF && (
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: 2,
            fontFamily: "'Inter', sans-serif", fontWeight: 300, marginBottom: 12,
          }}>YACHT CHARTER SELECTION</div>
        )}
        {!isBF && (
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.25)", letterSpacing: 3,
            fontFamily: "'Inter', sans-serif", fontWeight: 300,
          }}>LONDON &nbsp; DUBAI &nbsp; GENEVA &nbsp; PALMA &nbsp; MIAMI</div>
        )}
        <div style={{
          fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 20,
          fontFamily: "'Inter', sans-serif", fontWeight: 300,
        }}>
          {isBF
            ? "All particulars are given in good faith and believed correct but not guaranteed."
            : "© 2026 Roccabella Yachts. All rights reserved."
          }
        </div>
      </footer>
    </div>
  );
}
