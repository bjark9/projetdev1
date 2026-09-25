# Create your views here.
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Conversation
from .serializers import ConversationSerializer