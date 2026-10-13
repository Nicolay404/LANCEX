from django.urls import path

from . import me_views, views

urlpatterns = [
    path("me/summary/", me_views.MySummaryView.as_view(), name="me-summary"),
    path("me/participations/", me_views.MyParticipationsView.as_view(), name="me-participations"),
    path("me/activity/", me_views.MyActivityView.as_view(), name="me-activity"),
    path(
        "organizations/<uuid:organization_id>/registrations/",
        me_views.OrganizationRegistrationsView.as_view(),
        name="organization-registrations",
    ),
    path("auctions/", views.AuctionListView.as_view(), name="auctions"),
    path("auctions/<uuid:auction_id>/", views.AuctionDetailView.as_view(), name="auction-detail"),
    path("auctions/<uuid:auction_id>/publish/", views.AuctionPublishView.as_view(), name="auction-publish"),
    path("auctions/<uuid:auction_id>/cancel/", views.AuctionCancelView.as_view(), name="auction-cancel"),
    path("auctions/<uuid:auction_id>/live/", views.AuctionLiveView.as_view(), name="auction-live"),
    path("auctions/<uuid:auction_id>/bids/", views.AuctionBidsView.as_view(), name="auction-bids"),
    path("auctions/<uuid:auction_id>/result/", views.AuctionResultView.as_view(), name="auction-result"),
    path("auctions/<uuid:auction_id>/proxy-limit/", views.ProxyLimitView.as_view(), name="auction-proxy-limit"),
    path("auctions/<uuid:auction_id>/watch/", views.WatchView.as_view(), name="auction-watch"),
    path("auctions/<uuid:auction_id>/settlement/", views.SettlementView.as_view(), name="auction-settlement"),
    path("auctions/<uuid:auction_id>/rating/", views.RatingView.as_view(), name="auction-rating"),
    path("auctions/<uuid:auction_id>/candle-proof/", views.CandleProofView.as_view(), name="auction-candle-proof"),
    path("auctions/<uuid:auction_id>/participants/", views.ParticipantsView.as_view(), name="auction-participants"),
    path(
        "auctions/<uuid:auction_id>/participants/<uuid:participant_id>/decision/",
        views.ParticipantDecisionView.as_view(),
        name="auction-participant-decision",
    ),
    path("auctions/<uuid:auction_id>/sealed-offer/", views.SealedOfferView.as_view(), name="auction-sealed-offer"),
]
